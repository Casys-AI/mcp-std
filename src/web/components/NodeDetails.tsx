interface NodeData {
  id: string;
  label: string;
  server: string;
  pagerank: number;
  degree: number;
}

interface NodeDetailsProps {
  node: NodeData;
  onClose: () => void;
}

export default function NodeDetails({ node, onClose }: NodeDetailsProps) {
  return (
    <div class="absolute bottom-5 left-5 bg-black/90 p-5 rounded-lg border border-gray-700 min-w-[300px] backdrop-blur">
      <div class="flex justify-between items-start mb-3">
        <h3 class="text-lg font-semibold text-blue-500">{node.label}</h3>
        <button
          onClick={onClose}
          class="text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div class="space-y-2 text-sm">
        <p class="text-gray-300">
          <span class="text-gray-500">Server:</span> {node.server}
        </p>
        <p class="text-gray-300">
          <span class="text-gray-500">Tool ID:</span> {node.id}
        </p>
        <p class="text-gray-300">
          <span class="text-gray-500">PageRank:</span> {node.pagerank.toFixed(4)}
        </p>
        <p class="text-gray-300">
          <span class="text-gray-500">Degree:</span> {node.degree}
        </p>
      </div>
    </div>
  );
}
