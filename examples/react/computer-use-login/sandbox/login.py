"""Sign in on the site in the Chromium of this sandbox.

The server runs this script with LOGIN_SITE, LOGIN_USERNAME, and
LOGIN_PASSWORD in its environment, so the password is never on a command
line. The script talks to Chromium over the debugging protocol on 127.0.0.1:

1. Open LOGIN_SITE in the current tab.
2. Stop if the page is not on the origin of LOGIN_SITE.
3. Fill the username field and the password field, then submit the form.

It prints one JSON line: the address of the page after the sign-in, and
whether the page still has a password field. Errors go to stderr. No output
has the password in it.
"""

import asyncio
import json
import os
import sys
import time
import urllib.request
from urllib.parse import urlsplit

import websockets

# Fills the last text field before the password field, then submits the form.
# The native value setter and the input events make frameworks like React
# see the values.
FILL = """(username, password) => {
  const visible = (input) => input.offsetParent !== null
  const password_ = [...document.querySelectorAll('input[type=password]')].find(visible)
  if (!password_) return 'The page has no visible password field.'
  if (!password_.form) return 'The password field is not in a form.'
  const inputs = [...password_.form.querySelectorAll('input')]
  const user = inputs
    .slice(0, inputs.indexOf(password_))
    .reverse()
    .find((input) => ['text', 'email', 'tel'].includes(input.type) && visible(input))
  if (!user) return 'The form has no username field before the password field.'
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  for (const [input, value] of [[user, username], [password_, password]]) {
    input.focus()
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  password_.form.requestSubmit()
  return 'submitted'
}"""

TIMEOUT_S = 30


class LoginError(Exception):
    pass


async def main():
    site = os.environ["LOGIN_SITE"]
    username = os.environ["LOGIN_USERNAME"]
    password = os.environ["LOGIN_PASSWORD"]
    parts = urlsplit(site)
    origin = f"{parts.scheme}://{parts.netloc}"

    with urllib.request.urlopen("http://127.0.0.1:9222/json/list") as response:
        targets = json.load(response)
    page = next((target for target in targets if target["type"] == "page"), None)
    if page is None:
        raise LoginError("Chromium has no open tab.")

    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as socket:
        next_id = 0

        async def send(method, **params):
            nonlocal next_id
            next_id += 1
            await socket.send(json.dumps({"id": next_id, "method": method, "params": params}))
            while True:
                message = json.loads(await socket.recv())
                if message.get("id") == next_id:
                    if "error" in message:
                        raise LoginError(f"{method} failed: {message['error']['message']}")
                    return message["result"]

        async def evaluate(expression):
            result = await send(
                "Runtime.evaluate", expression=expression, returnByValue=True
            )
            # Never print the details: the expression can hold the password.
            if "exceptionDetails" in result:
                raise LoginError("A script on the page failed.")
            return result["result"].get("value")

        async def wait_for(condition):
            deadline = time.monotonic() + TIMEOUT_S
            while time.monotonic() < deadline:
                try:
                    if await evaluate(condition):
                        return True
                except LoginError:
                    pass  # The page is loading. Try again.
                await asyncio.sleep(0.2)
            return False

        await send("Page.navigate", url=site)
        if not await wait_for("document.readyState === 'complete'"):
            raise LoginError(f"{site} did not load in {TIMEOUT_S} s. Nothing was filled.")
        # A redirect can leave the site. Then the form belongs to someone else.
        page_origin = await evaluate("location.origin")
        if page_origin != origin:
            raise LoginError(f"The page is on {page_origin}, not {origin}. Nothing was filled.")

        before = await evaluate("location.href")
        result = await evaluate(f"({FILL})({json.dumps(username)}, {json.dumps(password)})")
        if result != "submitted":
            raise LoginError(result)

        # A sign-in usually opens another page. A page that stays put is fine too.
        await wait_for(
            f"location.href !== {json.dumps(before)} && document.readyState === 'complete'"
        )
        # A sign-in that failed can leave the password in the field. Clear it,
        # so nothing on the screen can show it.
        await evaluate(
            "document.querySelectorAll('input[type=password]').forEach((input) => { input.value = '' })"
        )
        print(
            json.dumps(
                {
                    "url": await evaluate("location.href"),
                    "hasPasswordField": await evaluate(
                        "!!document.querySelector('input[type=password]')"
                    ),
                }
            )
        )


try:
    asyncio.run(main())
except LoginError as error:
    print(error, file=sys.stderr)
    sys.exit(1)
