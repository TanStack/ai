import React from "react";
import { Box, Text } from "ink";
import { ACCENT } from "./theme";

/** One row of the command list or of a picker. */
export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  /** The current choice, for example the model in use. */
  current?: boolean;
}

const VISIBLE = 8;

/**
 * A list you move through with the arrow keys: the `/` command list, or a
 * picker such as `/connect` or `/model`. It shows at most 8 rows around the
 * selected one.
 */
export function Menu({
  title,
  items,
  selected,
  hint,
}: {
  title?: string;
  items: ReadonlyArray<MenuItem>;
  selected: number;
  hint: string;
}) {
  const start = Math.max(0, Math.min(selected - Math.floor(VISIBLE / 2), items.length - VISIBLE));
  const shown = items.slice(start, start + VISIBLE);
  const width = Math.max(...items.map((item) => item.label.length), 8);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {title ? <Text bold>{title}</Text> : null}
      {shown.map((item, index) => {
        const isSelected = start + index === selected;
        return (
          <Box key={item.id}>
            <Box flexShrink={0}>
              <Text color={isSelected ? ACCENT : undefined} bold={isSelected}>
                {`${isSelected ? "🦇" : " "} ${item.label.padEnd(width)}`}
              </Text>
            </Box>
            <Text color={item.current ? "green" : "gray"} wrap="truncate-end">
              {`  ${item.current ? "● " : ""}${item.detail ?? ""}`}
            </Text>
          </Box>
        );
      })}
      {items.length > VISIBLE ? (
        <Text dimColor>{`  ${selected + 1} of ${items.length}`}</Text>
      ) : null}
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
