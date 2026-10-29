import { MessageCircle, SquarePen } from "lucide-react";
import { useWorkspace } from "../workspace-context";
export function ChatSidebar({ onSelect }: { onSelect?: () => void }) {
  const { workspace, conversationId, openConversation } = useWorkspace();
  return (
    <div className="chat-sidebar">
      <button
        className="new-chat-button"
        onClick={() => {
          openConversation(null);
          onSelect?.();
        }}
      >
        <SquarePen size={18} />
        New chat
      </button>
      <div className="chat-sidebar-heading">Your chats</div>
      <nav aria-label="Chat history">
        {workspace.conversations.map((c) => (
          <button
            key={c.id}
            className={conversationId === c.id ? "selected" : ""}
            aria-current={conversationId === c.id ? "page" : undefined}
            title={c.title}
            onClick={() => {
              openConversation(c);
              onSelect?.();
            }}
          >
            <MessageCircle size={16} />
            <span>{c.title}</span>
          </button>
        ))}
      </nav>
      {!workspace.conversations.length && (
        <p className="muted chat-sidebar-empty">
          Your conversations will appear here.
        </p>
      )}
    </div>
  );
}
