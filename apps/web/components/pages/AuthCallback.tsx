import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { clearOAuthFlowId, getOAuthFlowDoneKey, peekOAuthFlow } from '../../lib/oauthReturnFlow';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

/**
 * OAuth 回调页（Google 等社交登录会跳回这里）。
 * 目的：
 * - 触发 supabase-js 处理 URL 中的 code/token 并落地 session
 * - 然后把用户带回“我的”页
 *
 * 历史栈说明：部分环境下 `/auth/callback` 仍会留在 `history` 中；用户关闭「我的」时 `goBack()`
 * 会再次进入本页。若仍 `replace('/me')` 会形成循环并出现 “Finishing sign-in” 闪现。
 * 通过 `oauthReturnFlow` 区分首次落地与二次进入：二次进入则 `replace('/discover')`。
 */
export default function AuthCallback() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();

  useEffect(() => {
    if (!supabase) return;
    if (!session) return;

    const flow = peekOAuthFlow();
    if (flow) {
      const doneKey = getOAuthFlowDoneKey(flow);
      if (sessionStorage.getItem(doneKey)) {
        try {
          sessionStorage.removeItem(doneKey);
          clearOAuthFlowId();
        } catch {
          /* ignore */
        }
        history.replace('/discover');
        return;
      }
      // 保留 flow，直到用户可能 goBack 再次进入本页时再一并清理（见上一分支）
      sessionStorage.setItem(doneKey, '1');
      history.replace('/me');
      return;
    }

    history.replace('/me');
  }, [history, session, supabase]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Signing in...</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div className="text-sm text-gray-600">Finishing sign-in, please wait.</div>
      </IonContent>
    </IonPage>
  );
}

