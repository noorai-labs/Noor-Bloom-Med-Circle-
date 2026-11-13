import type { useSignIn, useSignUp } from "@clerk/expo/legacy";
type SignIn = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type SignUp = NonNullable<ReturnType<typeof useSignUp>["signUp"]>;
export type EmailAttempt =
  { kind: "signIn"; emailAddressId: string } | { kind: "signUp" };
export function authError(error: unknown) {
  const first = (
    error as {
      errors?: { code?: string; longMessage?: string; message?: string }[];
    }
  )?.errors?.[0];
  if (first?.code === "too_many_requests")
    return "Too many attempts. Please wait before trying again.";
  return (
    first?.longMessage ||
    first?.message ||
    (error instanceof Error
      ? error.message
      : "We could not complete that request. Try again.")
  );
}
export class EmailAccountNotFoundError extends Error {
  constructor() {
    super("This account does not exist. Create an account to get started.");
    this.name = "EmailAccountNotFoundError";
  }
}
export async function createEmailAccount(
  signUp: SignUp,
  email: string,
): Promise<EmailAttempt> {
  const identifier = email.trim();
  if (!/^\S+@\S+\.\S+$/.test(identifier))
    throw new Error("Enter a valid email address.");
  await signUp.create({ emailAddress: identifier });
  await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
  return { kind: "signUp" };
}
export async function sendEmailCode(
  signIn: SignIn,
  signUp: SignUp,
  email: string,
): Promise<EmailAttempt> {
  const identifier = email.trim();
  if (!/^\S+@\S+\.\S+$/.test(identifier))
    throw new Error("Enter a valid email address.");
  let result;
  try {
    result = await signIn.create({ identifier });
  } catch (error) {
    const code = (error as { errors?: { code?: string }[] })?.errors?.[0]?.code;
    if (code !== "form_identifier_not_found") throw error;
    throw new EmailAccountNotFoundError();
  }
  const factor = result.supportedFirstFactors?.find(
    (f) => f.strategy === "email_code",
  );
  if (!factor || factor.strategy !== "email_code")
    throw new Error(
      "Email-code sign-in is not enabled for this account. Try Google or contact support.",
    );
  await signIn.prepareFirstFactor({
    strategy: "email_code",
    emailAddressId: factor.emailAddressId,
  });
  return { kind: "signIn", emailAddressId: factor.emailAddressId };
}
export async function resendEmailCode(
  signIn: SignIn,
  signUp: SignUp,
  attempt: EmailAttempt,
) {
  if (attempt.kind === "signUp")
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
  else
    await signIn.prepareFirstFactor({
      strategy: "email_code",
      emailAddressId: attempt.emailAddressId,
    });
}
export class EmailSetupError extends Error {
  constructor(public missingFields: string[]) {
    super(
      missingFields.includes("password")
        ? "Your email is confirmed. Email-only account creation is not enabled yet. Use Google for now, or contact support."
        : "Your email is confirmed, but your account needs additional setup. Use Google or contact support.",
    );
    this.name = "EmailSetupError";
  }
}
function completedSession(result: SignIn | SignUp) {
  if (result.status === "complete" && result.createdSessionId)
    return result.createdSessionId;
  const missing = "missingFields" in result ? result.missingFields : [];
  if (missing.length) throw new EmailSetupError(missing);
  throw new Error(
    "Additional account verification is required. Try Google or contact support.",
  );
}
export async function verifyEmailCode(
  signIn: SignIn,
  signUp: SignUp,
  attempt: EmailAttempt,
  code: string,
) {
  const resource = attempt.kind === "signUp" ? signUp : signIn;
  // A previous code attempt may have completed while activating its session failed.
  // Reuse that verified session rather than submitting a single-use OTP twice.
  if (resource.status === "complete" && resource.createdSessionId)
    return resource.createdSessionId;
  const alreadyVerified =
    attempt.kind === "signUp"
      ? signUp.verifications?.emailAddress?.status === "verified"
      : signIn.firstFactorVerification?.status === "verified";
  if (alreadyVerified) return completedSession(await resource.reload());
  if (!/^\d{6}$/.test(code))
    throw new Error("Enter the six-digit code from your email.");
  try {
    const result =
      attempt.kind === "signUp"
        ? await signUp.attemptEmailAddressVerification({ code })
        : await signIn.attemptFirstFactor({ strategy: "email_code", code });
    return completedSession(result);
  } catch (error) {
    const errorCode = (error as { errors?: { code?: string }[] })?.errors?.[0]
      ?.code;
    if (
      errorCode === "verification_already_verified" ||
      errorCode === "verification_already_completed"
    )
      return completedSession(await resource.reload());
    throw error;
  }
}
