/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIDefineResult, AIExplainResult, AISummarizeResult } from "../../utils/aiClient";

interface AIResponsePopoverProps {
  type: "define" | "explain" | "summarize";
  inputText: string;
  result: any;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

export default function AIResponsePopover({
  type,
  inputText,
  result,
  loading,
  error,
  onClose,
  onRetry,
}: AIResponsePopoverProps) {
  return (
    <div id="ai-response-popover" className="fixed top-6 right-6 z-50 w-full max-w-sm rounded-sm shadow-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md overflow-hidden animate-in slide-in-from-right duration-250 flex flex-col max-h-[88vh] text-black dark:text-white">
      {/* Popover Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5" id="ai-pop-hdr">
        <div className="flex items-center gap-3">
          <div>
            <h4 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.2em] leading-none mb-1">AI Companion Panel</h4>
            <span className="font-serif font-medium text-sm text-black dark:text-neutral-100 capitalize italic">
              {type === "define" ? "Word Definition" : type === "explain" ? "Concept Explanation" : "Chapter Summary"}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          id="btn-close-ai"
          className="px-2.5 py-1 rounded-sm text-[9px] uppercase tracking-wider font-sans font-bold border border-black/10 dark:border-white/10 hover:border-black dark:hover:border-white transition-all cursor-pointer bg-transparent text-black/60 dark:text-white/60"
        >
          Close
        </button>
      </div>

      {/* Popover Container Content */}
      <div className="flex-1 overflow-y-auto p-5 no-scrollbar text-black/80 dark:text-neutral-300" id="ai-pop-body">
        {loading && (
          <div className="space-y-4 animate-pulse py-3" id="ai-skeleton">
            <div className="h-6 bg-black/10 dark:bg-white/10 rounded-sm w-1/3" />
            <div className="space-y-2">
              <div className="h-4 bg-black/10 dark:bg-white/10 rounded-sm" />
              <div className="h-4 bg-black/10 dark:bg-white/10 rounded-sm w-5/6" />
              <div className="h-4 bg-black/10 dark:bg-white/10 rounded-sm w-4/5" />
            </div>
            <div className="h-[1px] bg-black/10 dark:bg-white/10 my-2" />
            <div className="h-4 bg-black/10 dark:bg-white/10 rounded-sm w-1/2" />
          </div>
        )}

        {error && (
          <div className="py-4 text-center" id="ai-error-view">
            <p className="text-xs font-bold uppercase tracking-wider text-black dark:text-white mb-2">Request Interrupted</p>
            <p className="text-xs text-black/60 dark:text-white/60 mb-4 px-2">{error}</p>
            <button
              onClick={onRetry}
              id="ai-retry-btn"
              className="px-4 py-2 border border-black dark:border-white text-[9px] uppercase tracking-[0.15em] font-bold text-black dark:text-white rounded-sm flex items-center gap-1.5 mx-auto hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all cursor-pointer bg-transparent"
            >
              <span>Retry Request</span>
            </button>
          </div>
        )}

        {!loading && !error && result && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Context snippet parsed */}
            <div className="text-xs font-serif text-black/60 dark:text-white/60 bg-black/[0.03] dark:bg-white/[0.03] p-3 rounded-sm border border-black/5 dark:border-white/5 italic">
              "{type === "define" ? inputText : inputText.length > 120 ? inputText.slice(0, 120) + "..." : inputText}"
            </div>

            {/* Render 1: Word Definition layout */}
            {type === "define" && (
              <div className="space-y-4" id="ai-result-define">
                <div>
                  <h3 className="font-serif font-semibold text-2xl text-black dark:text-white mt-1 italic leading-tight">
                    {(result as AIDefineResult).word || inputText}
                  </h3>
                </div>

                <div className="space-y-1">
                  <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                    Definition
                  </h5>
                  <p className="text-sm font-sans leading-relaxed text-black/80 dark:text-neutral-200">
                    {(result as AIDefineResult).definition}
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-sans font-bold text-black dark:text-white uppercase tracking-[0.15em] font-extrabold">
                    Contextual Interpretation
                  </h5>
                  <p className="text-sm font-sans leading-relaxed text-black/90 dark:text-neutral-200 p-3 rounded-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                    {(result as AIDefineResult).contextualMeaning}
                  </p>
                </div>

                {((result as AIDefineResult).simpleExample) && (
                  <div className="space-y-1">
                    <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                      Example Usage
                    </h5>
                    <p className="text-sm font-serif italic text-black/70 dark:text-neutral-400 leading-relaxed">
                      "{(result as AIDefineResult).simpleExample}"
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Render 2: Concept Explanation layout */}
            {type === "explain" && (
              <div className="space-y-4" id="ai-result-explain">
                <div className="space-y-1.5">
                  <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                    Explanation
                  </h5>
                  <p className="text-sm font-sans leading-relaxed text-black/80 dark:text-neutral-200">
                    {(result as AIExplainResult).plainExplanation}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h5 className="font-sans font-bold text-black dark:text-white uppercase tracking-[0.15em] font-extrabold">
                    Significance & Concept
                  </h5>
                  <p className="text-sm font-sans leading-relaxed text-black/90 dark:text-neutral-200 bg-black/5 dark:bg-white/5 p-3 rounded-sm border border-black/10 dark:border-white/10">
                    {(result as AIExplainResult).whyItMatters}
                  </p>
                </div>

                {/* Subtext Nuance Quote box */}
                {((result as AIExplainResult).possibleSubtext) && (
                  <div className="space-y-2 p-4 rounded-sm border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                    <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                      Literary Subtext
                    </h5>
                    <p className="text-xs font-serif leading-relaxed text-black/60 dark:text-neutral-400 italic whitespace-pre-line">
                      {(result as AIExplainResult).possibleSubtext}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Render 3: Chapter / Section Summary layout */}
            {type === "summarize" && (
              <div className="space-y-4" id="ai-result-summarize">
                <div className="space-y-1.5">
                  <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                    Key Synthesis
                  </h5>
                  <p className="text-sm font-sans leading-relaxed text-black/80 dark:text-neutral-200">
                    {(result as AISummarizeResult).whatHappened}
                  </p>
                </div>

                {/* Important Ideas Bullet list */}
                {((result as AISummarizeResult).importantIdeas?.length > 0) && (
                  <div className="space-y-2">
                    <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                      Takeaways & Insights
                    </h5>
                    <ul className="space-y-1.5 list-disc pl-4 text-xs font-sans text-black/70 dark:text-neutral-300">
                      {(result as AISummarizeResult).importantIdeas.map((idea, idx) => (
                        <li key={idx} className="leading-relaxed">{idea}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Characters/Concepts tags */}
                {((result as AISummarizeResult).charactersOrConcepts?.length > 0) && (
                  <div className="space-y-2">
                    <h5 className="font-sans font-bold text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.15em]">
                      Major Concepts
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {(result as AISummarizeResult).charactersOrConcepts.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold uppercase tracking-wider bg-black/5 dark:bg-white/10 text-black dark:text-neutral-300 border border-black/10 dark:border-white/10"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Single-line memory quote card */}
                {((result as AISummarizeResult).oneLineMemory) && (
                  <div className="p-3.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-sm">
                    <p className="text-xs font-serif leading-relaxed text-black/70 dark:text-neutral-300 italic">
                      “{(result as AISummarizeResult).oneLineMemory}”
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Popover Footer */}
      <div className="px-5 py-3.5 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] flex justify-end">
        <button
          onClick={onClose}
          id="btn-ai-footer-close"
          className="w-full text-center py-2.5 bg-transparent border border-black dark:border-white text-[10px] uppercase tracking-[0.15em] font-sans font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all cursor-pointer rounded-sm"
        >
          Return to Reading
        </button>
      </div>
    </div>
  );
}
