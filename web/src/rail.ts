// The banner's tail, and every other place a screen names the payment, when the server runs the fake payment port
// (CI, `PAYMENT=fake`): one value in plain words (5b "make it a 9"), so no screen says PayPal's sandbox in a build that
// sends nothing to PayPal, and no two screens word it differently.
export const FAKE_RAIL = "test build: pretend payments, nothing sent to PayPal";
