import { cloudMode } from "../cloud-config";
import { Redirect } from "expo-router";
import { EmailLogin } from "../screens/email-login";
export default function EmailSignInRoute() {
  return cloudMode ? <EmailLogin /> : <Redirect href="/sign-in" />;
}
