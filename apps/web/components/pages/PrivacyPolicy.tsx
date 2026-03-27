import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';

/**
 * Privacy Policy page (concise standard web version).
 */
export default function PrivacyPolicy() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" text="" aria-label="Back" />
          </IonButtons>
          <IonTitle>Privacy Policy</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div className="max-w-3xl mx-auto space-y-4 text-sm text-gray-700 leading-6">
          <p>
            Last updated: March 19, 2026
          </p>
          <p>
            This website is an entertainment platform where users predict property auction outcomes. It is not an official valuation or financial service.
          </p>

          <h2 className="text-base font-semibold text-gray-900">1. Information We Collect</h2>
          <p>
            We may collect account information (such as name, email, social login identifier), user-submitted predictions, and technical usage data (such as device/browser metadata and logs).
          </p>

          <h2 className="text-base font-semibold text-gray-900">2. How We Use Information</h2>
          <p>
            We use information to operate the service, show voting statistics, improve product performance, prevent abuse, and communicate important service updates.
          </p>

          <h2 className="text-base font-semibold text-gray-900">3. Data Sources</h2>
          <p>
            Listing information may come from publicly available real estate webpages and user-submitted links. We do not guarantee data completeness or accuracy.
          </p>

          <h2 className="text-base font-semibold text-gray-900">4. Sharing and Disclosure</h2>
          <p>
            We do not sell personal data. We may share limited data with service providers (hosting, authentication, analytics) as required to run the platform and with authorities when legally required.
          </p>

          <h2 className="text-base font-semibold text-gray-900">5. Cookies and Analytics</h2>
          <p>
            We may use cookies/local storage and analytics tools to maintain sessions and understand product usage.
          </p>

          <h2 className="text-base font-semibold text-gray-900">6. Data Retention</h2>
          <p>
            We retain account and prediction data for as long as needed to provide the service and meet legal obligations, then delete or anonymize where appropriate.
          </p>

          <h2 className="text-base font-semibold text-gray-900">7. Security</h2>
          <p>
            We use reasonable technical and organizational safeguards, but no system is completely secure.
          </p>

          <h2 className="text-base font-semibold text-gray-900">8. Your Rights</h2>
          <p>
            Subject to local law, you may request access, correction, or deletion of your personal information.
          </p>

          <h2 className="text-base font-semibold text-gray-900">9. Contact</h2>
          <p>
            For privacy questions, please contact the operator through official support channels used by this project.
          </p>
        </div>
      </IonContent>
    </IonPage>
  );
}

