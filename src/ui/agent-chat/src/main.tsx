/**
 * Agent Chat UI for MCP Apps
 *
 * Generic chat interface for conversational agents.
 * Can be used for help agents, specialized assistants, etc.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/agent-chat
 */

import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { cx } from "../../components/utils";
import { containers, typography, interactive } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface AgentConfig {
  name?: string;
  icon?: string;
  welcomeMessage?: string;
  placeholder?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Agent Chat", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Chat Component
// ============================================================================

function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<AgentConfig>({
    name: "Agent",
    icon: "🤖",
    welcomeMessage: "Bonjour ! Comment puis-je vous aider ?",
    placeholder: "Tapez votre message...",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Connect to MCP host
  useEffect(() => {
    app.connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

    // Receive tool results (agent responses or config)
    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (!textContent?.text) return;

        const parsed = JSON.parse(textContent.text);

        // Check if it's a config update
        if (parsed.config) {
          setConfig((prev) => ({ ...prev, ...parsed.config }));
          return;
        }

        // Check if it's an agent response
        if (parsed.message || parsed.content || parsed.response) {
          const content = parsed.message || parsed.content || parsed.response;
          addMessage("assistant", content);
          setIsLoading(false);
          return;
        }

        // Check if it's a welcome message
        if (parsed.welcomeMessage) {
          setConfig((prev) => ({ ...prev, welcomeMessage: parsed.welcomeMessage }));
          return;
        }

        // Default: treat as assistant message
        if (typeof parsed === "string") {
          addMessage("assistant", parsed);
          setIsLoading(false);
        }
      } catch {
        // If not JSON, treat as raw text message
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (textContent?.text) {
          addMessage("assistant", textContent.text);
          setIsLoading(false);
        }
      }
    };

    // Show welcome message on mount
    if (config.welcomeMessage) {
      setTimeout(() => {
        addMessage("assistant", config.welcomeMessage!);
      }, 300);
    }
  }, []);

  // Add a message to the conversation
  const addMessage = useCallback((role: Message["role"], content: string) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  // Send a message
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Add user message
    addMessage("user", text);
    setInput("");
    setIsLoading(true);

    // Notify MCP host
    notifyModel("message", { text });

    // Focus back to input
    inputRef.current?.focus();
  }, [input, isLoading, addMessage]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className={cx(containers.root, "flex flex-col h-full max-h-[500px]")}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border-default shrink-0">
        <span className="text-xl">{config.icon}</span>
        <span className={cx(typography.heading, "text-base")}>{config.name}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cx(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cx(
                "max-w-[85%] px-3 py-2 rounded-lg text-sm",
                msg.role === "user"
                  ? "bg-accent-default text-white rounded-br-none"
                  : "bg-bg-muted text-fg-default rounded-bl-none"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-bg-muted px-3 py-2 rounded-lg rounded-bl-none">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-border-default shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown as any}
          placeholder={config.placeholder}
          disabled={isLoading}
          className={cx(
            "flex-1 px-3 py-2 text-sm border border-border-default rounded-md bg-bg-canvas",
            "placeholder:text-fg-muted",
            interactive.focusRing,
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className={interactive.scaleOnHover}
        >
          Envoyer
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<AgentChat />, document.getElementById("app")!);
