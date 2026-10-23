/**
 * Hands a number to the phone's dialer. A click on a `tel:` link (rather than assigning
 * `location`) keeps the page alive in installed apps and lets tests stub the dialer.
 */
export function openTel(phone: string): void {
  const link = document.createElement('a');
  link.href = `tel:${phone}`;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
