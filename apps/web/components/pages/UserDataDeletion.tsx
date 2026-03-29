import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

const CONFIRM_PHRASE = 'DELETE';

/**
 * 用户数据删除页（面向终端用户）。
 * - 未登录：提示先登录。
 * - 已登录：允许请求删除 Supabase Auth 用户（以及相关业务数据清理）。
 */
export default function UserDataDeletion() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();
  const user = session?.user ?? null;

  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const canSubmit = useMemo(() => {
    if (!user) return false;
    return confirmText.trim().toUpperCase() === CONFIRM_PHRASE;
  }, [confirmText, user]);

  const submitDeletion = async () => {
    if (!supabase || !session?.access_token || !user) return;
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setToastMsg(json.error || 'Could not delete account.');
        setToastOpen(true);
        return;
      }

      await supabase.auth.signOut();
      history.replace('/discover');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setToastMsg(msg || 'Could not delete account.');
      setToastOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" text="" aria-label="Back" />
          </IonButtons>
          <IonTitle>User data deletion</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div className="max-w-xl mx-auto space-y-5">
          <div className="space-y-2">
            <div className="text-sm text-slate-700">
              You can request deletion of your account and associated data. This action is irreversible.
            </div>
            
          </div>

          {!user ? (
            <div className="rounded-xl bg-white p-4 text-sm text-slate-600">
              Please sign in first, then return to this page to request deletion.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-800">{user.email || 'your account'}</span>.
              </div>
              <IonItem lines="none" className="rounded-lg overflow-hidden">
                <IonLabel position="stacked">Type {CONFIRM_PHRASE} to confirm</IonLabel>
                <IonInput
                  value={confirmText}
                  onIonInput={e => setConfirmText(String(e.detail.value ?? ''))}
                  disabled={loading}
                  inputmode="text"
                  autocomplete="off"
                  autocapitalize="characters"
                />
              </IonItem>
              <IonButton
                expand="block"
                color="danger"
                disabled={!supabase || !canSubmit || loading}
                onClick={() => void submitDeletion()}
              >
                {loading ? 'Deleting...' : 'Delete my account'}
              </IonButton>
            </div>
          )}
        </div>

        <IonToast
          isOpen={toastOpen}
          message={toastMsg}
          duration={2800}
          color="danger"
          position="top"
          onDidDismiss={() => setToastOpen(false)}
        />
      </IonContent>
    </IonPage>
  );
}

