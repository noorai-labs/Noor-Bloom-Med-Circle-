import { cloudMode } from "../cloud-config";
import { Redirect } from "expo-router";
import { EmailLogin } from "../screens/email-login";
export default function EmailSignUpRoute() {
  return cloudMode ? (
    <EmailLogin creatingAccount />
  ) : (
    <Redirect href="/sign-in" />
  );
}
