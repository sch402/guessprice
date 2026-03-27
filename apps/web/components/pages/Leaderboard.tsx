import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';

/**
 * 榜单页（移动端优先）。
 * 这里将展示：最准预言家、参与最多、连胜等排行榜。
 */
export default function Leaderboard() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Leaderboard</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div className="text-gray-600">Leaderboard and personal stats will appear here.</div>
      </IonContent>
    </IonPage>
  );
}

