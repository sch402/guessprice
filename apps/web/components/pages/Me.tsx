import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import {
  chevronForwardOutline,
  closeOutline,
  createOutline,
  personCircleOutline,
  settingsOutline,
  statsChartOutline,
} from 'ionicons/icons';
import Image from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';
import { useHistory } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { getOAuthAvatarUrl } from '../../lib/oauthAvatar';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

type SectionHeadingProps = {
  /** Ionicon 图标引用（与 {@link IonIcon} 的 `icon` 一致） */
  icon: typeof settingsOutline;
  title: string;
};

/**
 * 区块标题：与「My Predictions」「Settings」等同级区块统一左对齐与字号。
 */
function SectionHeading({ icon, title }: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-2 px-1">
      <IonIcon icon={icon} className="text-slate-700 text-xl shrink-0" aria-hidden="true" />
      <span className="text-base font-semibold text-slate-800 leading-none">{title}</span>
    </div>
  );
}

/**
 * 个人资料展示名：OAuth `full_name` / `name`，否则兜底文案。
 */
function getProfileDisplayLabel(user: User): string {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full = m?.['full_name'];
  const name = m?.['name'];
  if (typeof full === 'string' && full.trim()) return full.trim();
  if (typeof name === 'string' && name.trim()) return name.trim();
  return 'Anonymous User';
}

/**
 * 我的页（移动端优先）。
 * 这里将展示登录状态、个人竞猜历史、命中率，以及设置入口。
 */
export default function Me() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();
  const user: User | null = session?.user ?? null;
  const avatarUrl = user ? getOAuthAvatarUrl(user) : null;
  /** 右侧抽屉滑入动画：首帧后再触发 transition，避免无过渡闪现 */
  const [panelEntered, setPanelEntered] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** 打开 Me 时锁定背景滚动，避免底层页面跟着滑 */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /**
   * 关闭右侧「我的」浮层：优先返回上一页，否则回到发现页。
   */
  const closeMeOverlay = () => {
    if (history.length > 1) {
      history.goBack();
      return;
    }
    history.replace('/discover');
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const openDisplayNameModal = () => {
    if (!user) return;
    const m = user.user_metadata as Record<string, unknown> | undefined;
    const full = m?.['full_name'];
    const name = m?.['name'];
    const cur =
      (typeof full === 'string' && full.trim()) || (typeof name === 'string' && name.trim()) || '';
    setNameDraft(cur);
    setNameModalOpen(true);
  };

  /**
   * 通过服务端 API 写入 Supabase Auth `user_metadata`，再刷新本地 session。
   */
  const saveDisplayName = async () => {
    if (!supabase || !session?.access_token) return;
    const next = nameDraft.trim();
    if (!next) {
      setToastMsg('Please enter a display name.');
      setToastOpen(true);
      return;
    }
    setNameSaving(true);
    try {
      const res = await fetch('/api/user/display-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ displayName: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToastMsg(json.error || 'Could not update display name.');
        setToastOpen(true);
        return;
      }
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setToastMsg(refreshErr.message);
        setToastOpen(true);
        return;
      }
      setNameModalOpen(false);
    } finally {
      setNameSaving(false);
    }
  };

  return (
    <IonPage className="fixed inset-0 z-[10000] h-full w-full max-w-full bg-transparent">
      <div className="flex h-full w-full flex-row">
        <button
          type="button"
          className="h-full w-[20%] shrink-0 cursor-pointer border-0 bg-black/45 p-0"
          onClick={closeMeOverlay}
          aria-label="Close profile panel"
        />
        <div
          className={`flex h-full w-[80%] max-w-[80%] flex-col bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${
            panelEntered ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <IonHeader className="ion-no-border">
            <IonToolbar>
              
              <IonButtons slot="end">
                <IonButton fill="clear" onClick={closeMeOverlay} aria-label="Close">
                  <IonIcon slot="icon-only" icon={closeOutline} className="text-xl text-slate-600" />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding" fullscreen>
        <div className="space-y-4">
          
          <div className="mt-3 pl-2 text-gray-600">
            {user ? (
              <div className="flex flex-col items-start gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <IonIcon icon={personCircleOutline} className="text-4xl" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 w-full space-y-1">
                  <div className="flex w-full min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1 truncate text-base font-medium text-slate-800">
                      {getProfileDisplayLabel(user)}
                    </div>
                    <IonButton
                      fill="clear"
                      size="small"
                      className="m-0 shrink-0 [--padding-start:8px] [--padding-end:8px]"
                      aria-label="Edit display name"
                      onClick={openDisplayNameModal}
                    >
                      <IonIcon slot="icon-only" icon={createOutline} className="text-xl text-slate-600" />
                    </IonButton>
                  </div>
                  <div className="truncate text-sm text-gray-500">{user.email}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-gray-900 font-medium">Price Guess - Street Auction Watch</div>
                
                <IonButton
                  expand="block"
                  routerLink="/sign-in"
                  routerDirection="forward"
                  color="success"
                  className="font-semibold [--background:#006644]"
                >
                  Sign in
                </IonButton>
              </div>
            )}
          </div>

          {user ? (
            <div className="space-y-2">
              <SectionHeading icon={statsChartOutline} title="My Predictions" />
              <IonList className="rounded-xl overflow-hidden" lines="none">
                <IonItem
                  button
                  detail={false}
                  lines="none"
                  routerLink="/me/guesses"
                  routerDirection="forward"
                  style={{ '--border-width': '0' } as CSSProperties}
                >
                  <IonLabel className="text-slate-700">All predictions</IonLabel>
                  <IonIcon slot="end" icon={chevronForwardOutline} className="text-gray-400" />
                </IonItem>
              </IonList>
            </div>
          ) : null}

          <div className="space-y-2">
            <SectionHeading icon={settingsOutline} title="Settings" />
            <IonList className="rounded-xl overflow-hidden" lines="none">
              <IonItem
                button
                detail={false}
                lines="none"
                routerLink="/privacy"
                routerDirection="forward"
                style={{ '--border-width': '0' } as CSSProperties}
              >
                <IonLabel>Privacy</IonLabel>
                <IonIcon slot="end" icon={chevronForwardOutline} className="text-gray-400" />
              </IonItem>
              <IonItem
                button
                detail={false}
                lines="none"
                routerLink="/terms"
                routerDirection="forward"
                style={{ '--border-width': '0' } as CSSProperties}
              >
                <IonLabel>Terms</IonLabel>
                <IonIcon slot="end" icon={chevronForwardOutline} className="text-gray-400" />
              </IonItem>
              <IonItem
                button
                detail={false}
                lines="none"
                routerLink="/user-data-deletion"
                routerDirection="forward"
                style={{ '--border-width': '0' } as CSSProperties}
              >
                <IonLabel className="text-red-600">Delete account</IonLabel>
                <IonIcon slot="end" icon={chevronForwardOutline} className="text-gray-400" />
              </IonItem>
            </IonList>
          </div>

          {user ? (
            <IonButton expand="block" color="medium" onClick={() => void signOut()} disabled={!supabase}>
              Sign Out
            </IonButton>
          ) : null}
        </div>
          </IonContent>
        </div>
      </div>

      <IonModal isOpen={nameModalOpen} onDidDismiss={() => setNameModalOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Edit display name</IonTitle>
            <IonButtons slot="end">
              <IonButton fill="clear" onClick={() => setNameModalOpen(false)} disabled={nameSaving}>
                Cancel
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p className="mb-3 text-sm text-slate-600">This name is shown in the app and on the activity feed.</p>
          <IonInput
            label="Display name"
            labelPlacement="stacked"
            value={nameDraft}
            maxlength={80}
            counter={true}
            disabled={nameSaving}
            onIonInput={e => setNameDraft(String(e.detail.value ?? ''))}
          />
          <IonButton
            expand="block"
            className="mt-6"
            disabled={nameSaving || !nameDraft.trim()}
            onClick={() => void saveDisplayName()}
          >
            {nameSaving ? 'Saving...' : 'Save'}
          </IonButton>
        </IonContent>
      </IonModal>

      <IonToast
        isOpen={toastOpen}
        message={toastMsg}
        duration={2600}
        color="danger"
        position="top"
        onDidDismiss={() => setToastOpen(false)}
      />
    </IonPage>
  );
}

