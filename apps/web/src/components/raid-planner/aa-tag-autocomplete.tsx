"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AAIcon } from "~/components/ui/aa-icons";
import { getAATagFlat } from "~/lib/aa-tag-registry";
import type { AATagEntry } from "~/lib/aa-tag-registry";
import type { AAIconType } from "~/lib/aa-formatting";

interface AATagAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onInsert: (replacement: string, rangeStart: number, rangeEnd: number) => void;
}

const MAX_VISIBLE = 6;

export function useAATagAutocomplete({
  textareaRef,
  value,
  onInsert,
}: AATagAutocompleteProps) {
  const [active, setActive] = useState(false);
  const [trigger, setTrigger] = useState<"{" | "|c">("{");
  const [query, setQuery] = useState("");
  const [triggerStart, setTriggerStart] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const allTags = useMemo(() => getAATagFlat(), []);

  const filteredTags = useMemo(() => {
    if (!active) return [];
    const q = query.toLowerCase();

    // If typing |c, only show colors
    const isColorTrigger = trigger === "|c";

    return allTags
      .filter((t) => {
        if (isColorTrigger && t.iconType !== "color") return false;
        if (!isColorTrigger && t.iconType === "color") return false;

        if (!q) return true;

        return (
          t.tag.toLowerCase().includes(q) ||
          t.displayName.toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [active, query, allTags, trigger]);

  const detectAutocomplete = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

    // Find the last unclosed brace OR |c
    const lastBrace = textBeforeCursor.lastIndexOf("{");
    const lastPipeC = textBeforeCursor.toLowerCase().lastIndexOf("|c");

    // Determine which one is closer to the cursor
    let currentTrigger: "{" | "|c" = "{";
    let lastTriggerPos = -1;

    if (lastBrace > lastPipeC) {
      currentTrigger = "{";
      lastTriggerPos = lastBrace;
    } else {
      currentTrigger = "|c";
      lastTriggerPos = lastPipeC;
    }

    if (lastTriggerPos === -1) {
      setActive(false);
      return;
    }

    const textAfterTrigger = textBeforeCursor.slice(
      lastTriggerPos + (currentTrigger === "{" ? 1 : 2),
    );

    // For braces, skip if it's closed
    if (currentTrigger === "{" && textAfterTrigger.includes("}")) {
      setActive(false);
      return;
    }

    // For pipe, skip if it's too long or has spaces (usually color names are single words)
    if (currentTrigger === "|c" && textAfterTrigger.includes(" ")) {
      setActive(false);
      return;
    }

    // Don't activate for assign: or ref: slots if in brace mode
    if (
      currentTrigger === "{" &&
      (textAfterTrigger.toLowerCase().startsWith("assign:") ||
        textAfterTrigger.toLowerCase().startsWith("ref:"))
    ) {
      setActive(false);
      return;
    }

    // Need at least 1 character after brace to start filtering
    // But for |c, we can show list immediately or after 1 char
    if (currentTrigger === "{" && textAfterTrigger.length === 0) {
      setActive(false);
      return;
    }

    // Calculate coordinates
    const coordinates = getCaretCoordinates(textarea, lastTriggerPos);
    setCoords(coordinates);

    setTrigger(currentTrigger);
    setTriggerStart(lastTriggerPos);
    setQuery(textAfterTrigger);
    setActive(true);
    setSelectedIndex(0);
  }, [value, textareaRef]);

  // Run detection on value or cursor changes
  useEffect(() => {
    detectAutocomplete();
  }, [detectAutocomplete]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as
      | HTMLElement
      | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const insertTag = useCallback(
    (entry: AATagEntry) => {
      let replacement = "";
      if (trigger === "{") {
        replacement = `{${entry.tag}}`;
      } else {
        // |c trigger
        replacement = `|c${entry.tag}`;
      }

      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart;
      onInsert(replacement, triggerStart, cursorPos);
      setActive(false);
    },
    [triggerStart, trigger, onInsert, textareaRef],
  );

  // Keyboard handler — must be attached to the textarea
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!active || filteredTags.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredTags.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const entry = filteredTags[selectedIndex];
        if (entry) insertTag(entry);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // Prevent dialog from closing
        setActive(false);
      }
    },
    [active, filteredTags, selectedIndex, insertTag],
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow click/onMouseDown events on dropdown to fire first
    setTimeout(() => {
      setActive(false);
    }, 150);
  }, []);

  if (!active || filteredTags.length === 0) {
    return { dropdown: null, handleKeyDown, handleBlur, isOpen: false };
  }

  const dropdown = (
    <div
      className="absolute z-50 w-[280px] overflow-hidden rounded-md border bg-popover shadow-md"
      ref={listRef}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
    >
      <div
        className="overflow-y-auto"
        style={{ maxHeight: `${MAX_VISIBLE * 28}px` }}
      >
        {filteredTags.map((entry, idx) => (
          <button
            key={`${entry.category}-${entry.tag}`}
            type="button"
            className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${
              idx === selectedIndex ? "bg-accent text-accent-foreground" : ""
            }`}
            onMouseDown={(e) => {
              e.preventDefault(); // keep textarea focus
              insertTag(entry);
            }}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            {entry.iconType === "color" ? (
              <div
                className="h-3 w-3 shrink-0 rounded-sm border border-white/20"
                style={{ backgroundColor: entry.iconName }}
              />
            ) : entry.iconType !== "arrow" ? (
              <AAIcon
                name={entry.iconName}
                type={entry.iconType as AAIconType}
                size={14}
                className="inline-block shrink-0 align-text-bottom"
              />
            ) : (
              <span className="inline-block w-[14px] shrink-0 text-center text-yellow-400">
                {entry.iconName === "left"
                  ? "\u25C4"
                  : entry.iconName === "right"
                    ? "\u25BA"
                    : entry.iconName === "up"
                      ? "\u25B2"
                      : "\u25BC"}
              </span>
            )}
            <code className="shrink-0 text-[11px]">
              {trigger === "{" ? `{${entry.tag}}` : `|c${entry.tag}`}
            </code>
            <span className="truncate text-[10px] text-muted-foreground">
              {entry.displayName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return { dropdown, handleKeyDown, handleBlur, isOpen: true };
}

/**
 * Robust caret coordinate calculation for textarea
 * Based on creating a hidden mirror div and measuring the cursor position
 */
function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
  const div = document.createElement("div");
  const style = window.getComputedStyle(element);

  // Copy textarea styles to the mirror div
  const properties = [
    "direction",
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "MozTabSize",
  ];

  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";

  properties.forEach((prop) => {
    // @ts-ignore
    div.style[prop] = style[prop];
  });

  // Content before the caret
  div.textContent = element.value.substring(0, position);

  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || ".";
  div.appendChild(span);

  document.body.appendChild(div);

  const { offsetTop, offsetLeft } = span;

  // Cleanup
  document.body.removeChild(div);

  // Correct for scroll position
  const top = offsetTop - element.scrollTop + 20; // +20 for some vertical offset
  const left = offsetLeft - element.scrollLeft;

  return { top, left };
}
