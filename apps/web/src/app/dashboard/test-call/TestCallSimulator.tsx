"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TestCallSimulatorProps = {
  initialGreeting: string;
};

export function TestCallSimulator({ initialGreeting }: TestCallSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: initialGreeting,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apiMessages = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    [messages],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content: trimmedInput,
      },
    ];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/test-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...apiMessages,
            {
              role: "user",
              content: trimmedInput,
            },
          ],
        }),
      });

      const body = (await response.json()) as { reply?: string; error?: string };

      if (!response.ok || !body.reply) {
        throw new Error(body.error ?? "The AI receptionist did not respond.");
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: body.reply,
        },
      ]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong.");
      setMessages(messages);
      setInput(trimmedInput);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function resetConversation() {
    setMessages([
      {
        role: "assistant",
        content: initialGreeting,
      },
    ]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Test Call Simulator</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Type as a customer and preview how the AI receptionist replies.
          </p>
        </div>
        <button
          type="button"
          onClick={resetConversation}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
        >
          Clear conversation
        </button>
      </div>

      <div className="flex min-h-[480px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message, index) => {
            const isCustomer = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[min(42rem,85%)] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    isCustomer
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className={`mb-1 text-xs font-black uppercase tracking-[0.16em] ${isCustomer ? "text-slate-300" : "text-violet-700"}`}>
                    {isCustomer ? "Customer" : "Receptionist"}
                  </div>
                  {message.content}
                </div>
              </div>
            );
          })}

          {isLoading ? (
            <div className="flex justify-start">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm">
                Receptionist is typing...
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mx-5 mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={sendMessage} className="border-t border-slate-200 p-5">
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Customer message</span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="Example: How much is a gel manicure?"
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              This simulator uses dashboard settings and does not place a real call.
            </p>
            <button
              disabled={isLoading || input.trim().length === 0}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
