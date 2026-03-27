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
 * Terms of Service page (concise standard web version).
 */
export default function TermsOfService() {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" text="" aria-label="Back" />
          </IonButtons>
          <IonTitle>Terms of Service</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div className="max-w-3xl mx-auto space-y-4 text-sm text-gray-700 leading-6">
          <p>
            Last updated: March 19, 2026
          </p>
          <p>
            By accessing or using this website, you agree to these Terms of Service.
          </p>

          <h2 className="text-base font-semibold text-gray-900">1. Service Nature</h2>
          <p>
            This website is for entertainment and social interaction. It is not an official platform, valuation service, legal service, or financial advice provider.
          </p>

          <h2 className="text-base font-semibold text-gray-900">2. Eligibility and Accounts</h2>
          <p>
            You are responsible for your account credentials and all activities under your account. You must use lawful and accurate account information.
          </p>

          <h2 className="text-base font-semibold text-gray-900">3. User Conduct</h2>
          <p>
            You agree not to misuse the service, interfere with system operations, submit unlawful content, or attempt unauthorized access.
          </p>

          <h2 className="text-base font-semibold text-gray-900">4. Content and Data</h2>
          <p>
            Listing and market-related data may come from public sources and user submissions. We do not warrant completeness, timeliness, or accuracy.
          </p>

          <h2 className="text-base font-semibold text-gray-900">5. Intellectual Property</h2>
          <p>
            The platform design, branding, and original content are protected by applicable intellectual property laws. Third-party trademarks and data remain property of their respective owners.
          </p>

          <h2 className="text-base font-semibold text-gray-900">6. Disclaimers</h2>
          <p>
            The service is provided “as is” and “as available.” To the maximum extent permitted by law, we disclaim warranties of any kind, including fitness for a particular purpose.
          </p>

          <h2 className="text-base font-semibold text-gray-900">7. Limitation of Liability</h2>
          <p>
            To the extent permitted by law, we are not liable for indirect, incidental, or consequential losses arising from use of the service.
          </p>

          <h2 className="text-base font-semibold text-gray-900">8. Changes and Termination</h2>
          <p>
            We may modify, suspend, or discontinue any part of the service at any time. We may update these Terms from time to time.
          </p>

          <h2 className="text-base font-semibold text-gray-900">9. Governing Law</h2>
          <p>
            These Terms are governed by applicable local laws in the jurisdiction where the project operator provides the service.
          </p>
        </div>
      </IonContent>
    </IonPage>
  );
}

