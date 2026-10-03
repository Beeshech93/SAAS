/**
 * Hook for automatic replies. The webhook asks the responder for an answer only when the
 * conversation's AI is ACTIVE. The AI module (next phase) will register itself here;
 * until then no automatic reply is sent.
 */
export interface InboundContext {
  businessId: string;
  conversationId: string;
  customerId: string;
  text: string;
}

export interface AutoResponder {
  respond(ctx: InboundContext): Promise<string | null>;
}

let responder: AutoResponder | null = null;
export const getAutoResponder = () => responder;
export const setAutoResponder = (r: AutoResponder | null) => {
  responder = r;
};
