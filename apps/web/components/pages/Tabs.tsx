import { Redirect, Route, Switch } from 'react-router-dom';
import {
  IonRouterOutlet,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/react';
import { compassOutline, gameControllerOutline, newspaperOutline, searchOutline, trophyOutline } from 'ionicons/icons';

import Discover from './Discover';
import Feed from './Feed';
import Search from './Search';
import Guess from './Guess';
import Leaderboard from './Leaderboard';
import Me from './Me';
import MyGuesses from './MyGuesses';
import AuthCallback from './AuthCallback';
import PrivacyPolicy from './PrivacyPolicy';
import SignIn from './SignIn';
import TermsOfService from './TermsOfService';
import UserDataDeletion from './UserDataDeletion';

const Tabs = () => {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Switch>
          <Route path="/auth/callback" render={() => <AuthCallback />} exact={true} />
          <Route path="/privacy" render={() => <PrivacyPolicy />} exact={true} />
          <Route path="/terms" render={() => <TermsOfService />} exact={true} />
          <Route path="/discover" render={() => <Discover />} exact={true} />
          <Route path="/feed" render={() => <Feed />} exact={true} />
          <Route path="/search" render={() => <Search />} exact={true} />
          <Route path="/guess" render={() => <Guess />} exact={true} />
          <Route path="/leaderboard" render={() => <Leaderboard />} exact={true} />
          <Route path="/me/guesses" render={() => <MyGuesses />} exact={true} />
          <Route path="/me" render={() => <Me />} exact={true} />
          <Route path="/user-data-deletion" render={() => <UserDataDeletion />} exact={true} />
          <Route path="/sign-in" render={() => <SignIn />} exact={true} />
          <Route path="" render={() => <Redirect to="/discover" />} exact={true} />
        </Switch>
      </IonRouterOutlet>
      <IonTabBar slot="bottom">
        <IonTabButton tab="discover" href="/discover">
          <IonIcon icon={compassOutline} />
          <IonLabel>Home</IonLabel>
        </IonTabButton>
       
        <IonTabButton tab="search" href="/search">
          <IonIcon icon={searchOutline} />
          <IonLabel>Search</IonLabel>
        </IonTabButton>
        <IonTabButton tab="feed" href="/feed">
          <IonIcon icon={newspaperOutline} />
          <IonLabel>Feed</IonLabel>
        </IonTabButton>
        
      </IonTabBar>
    </IonTabs>
  );
};

export default Tabs;
