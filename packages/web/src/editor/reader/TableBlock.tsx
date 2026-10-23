import type { ReactNode } from 'react'
/**
 * `:::table` — a markdown table, scrolling, first column emphasised.
 *
 * Small on purpose. It scrolls in its own box so a wide grid never makes the
 * page move sideways, and it emphasises the first column as the key of its
 * row. It does NOT colour anything: severities and scales belong to whoever
 * has a domain, and a plugin that wants one overrides this block.
 *
 * The body is rendered by the ordinary table branch; this only dresses it.
 */
export function TableBlock({ children }: { readonly children: ReactNode }) {
  return (
    <div className="adestia-table-scroll adestia-tableblock">{children}</div>
  )
}

