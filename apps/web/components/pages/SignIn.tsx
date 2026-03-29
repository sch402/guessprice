import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import { closeOutline, logoApple, logoFacebook } from 'ionicons/icons';
import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useHistory } from 'react-router-dom';
import {
  signInWithAppleOAuth,
  signInWithFacebookOAuth,
  signInWithGoogleOAuth,
} from '../../lib/oauthSignInActions';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

/** Domain 风格主色（深绿链接 / 强调） */
const BRAND_GREEN = '#006644';
/** 浅绿描边（按钮边框） */
const BORDER_MINT = '#C1E8AC';
const SUBTEXT = '#666666';

/**
 * Google 品牌四色「G」标记（SVG，与当前 Sign in with Google 常见视觉一致）。
 */
function GoogleMarkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={26}
      height={26}
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * 全屏登录页：OAuth 与 `Me` 共用逻辑，视觉参考 Domain「Log in or sign up」样式。
 */
export default function SignIn() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  /** 已登录则回到「我的」 */
  useEffect(() => {
    if (session?.user) {
      history.replace('/me');
    }
  }, [history, session?.user]);

  const close = () => {
    if (history.length > 1) {
      history.goBack();
      return;
    }
    history.replace('/discover');
  };

  const showError = (msg: string) => {
    setToastMsg(msg);
    setToastOpen(true);
  };

  const onGoogle = async () => {
    try {
      await signInWithGoogleOAuth(supabase);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not start Google sign-in.');
    }
  };

  const onFacebook = async () => {
    try {
      await signInWithFacebookOAuth(supabase);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not start Facebook sign-in.');
    }
  };

  const onApple = async () => {
    const r = await signInWithAppleOAuth(supabase);
    if (!r.ok) {
      showError(r.message);
    }
  };

  return (
    <IonPage className="[--background:#ffffff]">
      <IonHeader className="ion-no-border">
        <IonToolbar className="[--background:#ffffff] [--border-width:0]">
          <IonTitle className="sr-only">Log in or sign up</IonTitle>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={close} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} className="text-2xl text-slate-500" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="[--background:#ffffff]" fullscreen>
        <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 pb-8 pt-0">
          {/* Hero：大图 + 圆形裁切 + 浅绿点缀 */}
          <div className="relative -mx-5 mb-6 h-56 overflow-hidden sm:h-64">
            <div
              className="absolute left-1/2 top-0 h-[120%] w-[120%] -translate-x-1/2 rounded-b-[50%] bg-slate-100"
              aria-hidden="true"
            />
            <div className="relative mx-auto mt-2 h-52 w-52 overflow-hidden rounded-full shadow-sm ring-1 ring-black/5 sm:h-56 sm:w-56">
              <Image
                src="/img/c1.avif"
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 208px, 224px"
                priority
                unoptimized
              />
            </div>
            <div
              className="absolute bottom-6 right-[12%] h-4 w-4 rounded-full sm:right-[18%]"
              style={{ backgroundColor: BORDER_MINT }}
              aria-hidden="true"
            />
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold leading-tight text-black sm:text-[1.65rem]">
              Sign in
            </h1>
            <p className="text-[15px] leading-snug" style={{ color: SUBTEXT }}>
              Vote, Predict, and Watch Auctions.
            </p>
          </div>

          <div className="mt-8 flex w-full flex-col gap-3">
            <SocialButton
              icon={<GoogleMarkIcon />}
              label="Continue with Google"
              onClick={() => void onGoogle()}
              disabled={!supabase}
              borderColor={BORDER_MINT}
            />
            <SocialButton
              icon={<IonIcon icon={logoApple} className="text-[26px] text-black" aria-hidden="true" />}
              label="Continue with Apple"
              onClick={() => void onApple()}
              disabled={!supabase}
              borderColor={BORDER_MINT}
            />
            <SocialButton
              icon={<IonIcon icon={logoFacebook} className="text-[26px] text-[#1877F2]" aria-hidden="true" />}
              label="Continue with Facebook"
              onClick={() => void onFacebook()}
              disabled={!supabase}
              borderColor={BORDER_MINT}
            />
          </div>

          <p className="mt-auto pt-10 text-center text-xs leading-relaxed" style={{ color: SUBTEXT }}>
            By continuing with Guess Price, I agree to the{' '}
            <Link to="/terms" className="font-semibold underline-offset-2 hover:underline" style={{ color: BRAND_GREEN }}>
              Conditions of use
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="font-semibold underline-offset-2 hover:underline" style={{ color: BRAND_GREEN }}>
              Privacy policy
            </Link>
            .
          </p>
        </div>
      </IonContent>

      <IonToast
        isOpen={toastOpen}
        message={toastMsg}
        duration={3200}
        color="danger"
        position="top"
        onDidDismiss={() => setToastOpen(false)}
      />
    </IonPage>
  );
}

type SocialButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  borderColor: string;
};

/**
 * Domain 风格：白底、圆角、浅绿细边框、左图标 + 居中标题。
 */
function SocialButton({ icon, label, onClick, disabled, borderColor }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-[12px] border bg-white px-4 py-3.5 text-left shadow-sm outline-none transition active:opacity-90 enabled:hover:bg-slate-50/80 disabled:cursor-not-allowed disabled:opacity-45"
      style={{ borderColor }}
      aria-label={label}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 text-center text-[15px] font-medium text-black">{label}</span>
      <span className="w-8 shrink-0" aria-hidden="true" />
    </button>
  );
}
