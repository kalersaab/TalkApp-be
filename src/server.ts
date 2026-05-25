import App from '@/app';
import AuthRoute from '@routes/auth.route';
import { ChatRoute } from '@routes/chat.route';
import IndexRoute from '@routes/index.route';
import { MatchingRoute } from '@routes/matching.route';
import { NotificationRoute } from '@routes/notification.route';
import { ProfileRoute } from '@routes/profile.route';
import { ShowcaseRoute } from '@routes/showcase.route';
import { TranslationRoute } from '@routes/translation.route';
import validateEnv from '@utils/validateEnv';
import { UserRoute } from './routes/users.route';

validateEnv();

const app = new App([
  new IndexRoute(),
  new UserRoute(),
  new AuthRoute(),
  new ChatRoute(),
  new MatchingRoute(),
  new ProfileRoute(),
  new TranslationRoute(),
  new NotificationRoute(),
  new ShowcaseRoute(),
]);

app.listen();
