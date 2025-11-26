export interface ApprovalProps {
  toolName: string;
  input: any;
  onApprove: () => void;
  onDeny: () => void;
}

export default function Approval({
  toolName,
  input,
  onApprove,
  onDeny,
}: ApprovalProps) {
  return (
    <div class="p-5 bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-2xl shadow-lg">
      <p class="text-white font-semibold mb-3">Approve {toolName}?</p>
      <div class="text-gray-300 text-sm mb-4">
        <pre class="bg-gray-900/80 p-3 rounded-xl text-xs overflow-x-auto border border-gray-700/50">
          {JSON.stringify(input, null, 2)}
        </pre>
      </div>
      <div class="flex gap-3">
        <button
          onClick={onApprove}
          class="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg"
        >
          ✓ Approve
        </button>
        <button
          onClick={onDeny}
          class="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg"
        >
          ✗ Deny
        </button>
      </div>
    </div>
  );
}
