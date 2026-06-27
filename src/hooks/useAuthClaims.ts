import { useEffect, useState } from "react";
import { getEffectiveAuthContext, readAuthClaims, type AuthClaims, type EffectiveAuthContext } from "../lib/authClaims";
import { useAppStore } from "../stores/appStore";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";

interface UseAuthClaimsReturn {
  claims: AuthClaims;
  effectiveAuth: EffectiveAuthContext;
  loading: boolean;
}

export function useAuthClaims(): UseAuthClaimsReturn {
  const { currentUser: repUser } = useAppStore();
  const { currentUser: firebaseUser, authLoading } = useFirebaseAuthUser();
  const [claims, setClaims] = useState<AuthClaims>({});
  const [claimsLoading, setClaimsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (authLoading || !firebaseUser) {
      setClaims({});
      setClaimsLoading(false);
      return;
    }

    setClaimsLoading(true);
    firebaseUser
      .getIdTokenResult()
      .then((tokenResult) => {
        if (!cancelled) setClaims(readAuthClaims(tokenResult));
      })
      .catch(() => {
        if (!cancelled) setClaims({});
      })
      .finally(() => {
        if (!cancelled) setClaimsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser]);

  return {
    claims,
    effectiveAuth: getEffectiveAuthContext(repUser, claims),
    loading: authLoading || claimsLoading,
  };
}
