---
'@tanstack/ai-harness': minor
---

Add the `goal({ judge, maxRounds })` plugin to `@tanstack/ai-harness/plugins`. `/goal <text>` sets a goal and starts a turn. After each turn, the judge model checks the goal, and the plugin starts the next turn until the goal is met, the round limit is reached, a turn waits for approval or fails, or the user sends a message. `/goal`, `/goal stop`, and `/goal resume` show and control it. The `GoalMet` event fires when the goal is met, and `selectGoal(session.snapshot())` reads the goal for a UI.
