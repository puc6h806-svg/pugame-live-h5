/** True only when the normalized event carries `highlight: true` from the backend. */
export function isHighlighted(ev: { highlight?: boolean } | null | undefined): boolean {
  return ev?.highlight === true
}
