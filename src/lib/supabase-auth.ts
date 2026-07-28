export type SupabaseAuthError = {
  message: string;
};

export type SupabaseOtpClient = {
  auth: {
    signInWithOtp(input: {
      email: string;
      options: {
        emailRedirectTo: string;
      };
    }): Promise<{ error: SupabaseAuthError | null }>;
  };
};

export type SupabaseCodeExchangeClient = {
  auth: {
    exchangeCodeForSession(code: string): Promise<{
      error: SupabaseAuthError | null;
    }>;
  };
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAuthCallbackUrl(
  appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL,
  browserOrigin?: string,
) {
  const baseUrl = appUrl?.trim() || browserOrigin?.trim();

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL is not configured.");
  }

  return `${trimTrailingSlash(baseUrl)}/auth/callback`;
}

export async function requestMagicLinkEmail(
  email: string,
  client: SupabaseOtpClient,
  browserOrigin?: string,
) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    throw new Error("メールアドレスを入力してください。");
  }

  const emailRedirectTo = getAuthCallbackUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL,
    browserOrigin,
  );
  const { error } = await client.auth.signInWithOtp({
    email: trimmedEmail,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    email: trimmedEmail,
    emailRedirectTo,
  };
}

export async function exchangeMagicLinkCode(
  code: string | null | undefined,
  client: SupabaseCodeExchangeClient,
) {
  const trimmedCode = code?.trim();

  if (!trimmedCode) {
    throw new Error("認証コードが見つかりません。ログイン画面から再度お試しください。");
  }

  const { error } = await client.auth.exchangeCodeForSession(trimmedCode);

  if (error) {
    throw new Error(error.message);
  }
}
