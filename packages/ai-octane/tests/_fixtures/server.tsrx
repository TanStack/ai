import { useChat } from '@tanstack/ai-octane';
import type { UIMessage } from '@tanstack/ai-octane';

const initialMessages: UIMessage[] = [
	{
		id: 'msg-1',
		role: 'user',
		parts: [{ type: 'text', content: 'Hello Ada' }],
		createdAt: new Date(0),
	},
];

export function ServerChat() @{
	const { messages } = useChat({
		fetcher: () => {
			throw new Error('no fetch during SSR');
		},
		initialMessages,
	});

	<ul id="messages">
		@for (const message of messages; key message.id) {
			<li>
				{message.parts
					.map((part) => (part.type === 'text' ? part.content : ''))
					.join('') as string}
			</li>
		}
	</ul>
}
