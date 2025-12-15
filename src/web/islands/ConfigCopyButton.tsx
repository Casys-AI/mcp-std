/**
 * Config Copy Button Island
 *
 * Interactive button to copy MCP configuration to clipboard.
 *
 * @module web/islands/ConfigCopyButton
 */

import { useSignal } from "@preact/signals";

interface ConfigCopyButtonProps {
  config: string;
}

export default function ConfigCopyButton({ config }: ConfigCopyButtonProps) {
  const copied = useSignal(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const buttonStyle = {
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: "600",
    fontFamily: "'Geist', sans-serif",
    borderRadius: "4px",
    border: "1px solid rgba(255, 184, 111, 0.08)",
    background: copied.value ? "rgba(74, 222, 128, 0.2)" : "#08080a",
    color: copied.value ? "#4ade80" : "#a8a29e",
    cursor: "pointer",
    transition: "all 0.2s",
  };

  return (
    <button
      type="button"
      style={buttonStyle}
      onClick={handleCopy}
      onMouseOver={(e) => {
        if (!copied.value) {
          (e.target as HTMLButtonElement).style.borderColor = "#FFB86F";
          (e.target as HTMLButtonElement).style.color = "#FFB86F";
        }
      }}
      onMouseOut={(e) => {
        if (!copied.value) {
          (e.target as HTMLButtonElement).style.borderColor = "rgba(255, 184, 111, 0.08)";
          (e.target as HTMLButtonElement).style.color = "#a8a29e";
        }
      }}
    >
      {copied.value ? "Copied!" : "Copy"}
    </button>
  );
}
