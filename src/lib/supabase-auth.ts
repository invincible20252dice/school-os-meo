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

export type SupabaseOAuthClient = {
  auth: {
    signInWithOAuth(input: {
      provider: "google";
      options: {
        redirectTo: string;
        scopes: string;
        queryParams: {
          access_type: string;
          prompt: string;
        };
      };
    }): Promise<{ error: SupabaseAuthError | null }>;
  };
};

export type SupabaseCodeExchangeClient = {
  auth: {
    exchangeCodeForSession(code: string): Promise<{
      error: SupabaseAuthError | null;
    }>;
    setSession(input: {
      access_token: string;
      refresh_token: string;
    }): Promise<{ error: SupabaseAuthError | null }>;
    verifyOtp(input: {
      token_hash: string;
      type: SupabaseEmailOtpType;
    }): Promise<{ error: SupabaseAuthError | null }>;
  };
};

export type SupabaseEmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

export type SupabaseAuthCallbackParams = {
  search: string;
  hash: string;
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

export async function startGoogleOAuth(
  client: SupabaseOAuthClient,
  browserOrigin?: string,
) {
  const redirectTo = getAuthCallbackUrl(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL,
    browserOrigin,
  );
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: "https://www.googleapis.com/auth/business.manage",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return { redirectTo };
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

function getUrlParams(value: string) {
  const normalizedValue = value.startsWith("?") || value.startsWith("#")
    ? value.slice(1)
    : value;

  return new URLSearchParams(normalizedValue);
}

function getParam(
  searchParams: URLSearchParams,
  hashParams: URLSearchParams,
  key: string,
) {
  return searchParams.get(key)?.trim() || hashParams.get(key)?.trim() || "";
}

function getOtpType(value: string): SupabaseEmailOtpType {
  const supportedTypes: SupabaseEmailOtpType[] = [
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
  ];

  return supportedTypes.includes(value as SupabaseEmailOtpType)
    ? (value as SupabaseEmailOtpType)
    : "email";
}

export async function exchangeSupabaseAuthCallback(
  params: SupabaseAuthCallbackParams,
  client: SupabaseCodeExchangeClient,
) {
  const searchParams = getUrlParams(params.search);
  const hashParams = getUrlParams(params.hash);
  const errorDescription = getParam(
    searchParams,
    hashParams,
    "error_description",
  );

  if (errorDescription) {
    throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
  }

  const code = getParam(searchParams, hashParams, "code");

  if (code) {
    await exchangeMagicLinkCode(code, client);
    return;
  }

  const tokenHash = getParam(searchParams, hashParams, "token_hash");

  if (tokenHash) {
    const type = getOtpType(getParam(searchParams, hashParams, "type"));
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const accessToken = getParam(searchParams, hashParams, "access_token");
  const refreshToken = getParam(searchParams, hashParams, "refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  throw new Error(
    "認証トークンが見つかりません。ログイン画面から再度お試しください。",
  );
}
