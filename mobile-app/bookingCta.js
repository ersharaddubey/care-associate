/** Booking CTA title — parentheses avoid empty label when user is logged in */
export function payConfirmTitle(payBusy, user) {
  if (payBusy) return 'Opening secure payment...';
  return (user ? '' : 'Log in & ') + 'Pay & confirm booking';
}
