import App from '@/app';
import AuthRoute from '@routes/auth.route';
import { ChatRoute } from '@routes/chat.route';
import { GroupChatRoute } from '@routes/groupChat.route';
import IndexRoute from '@routes/index.route';
import { MatchingRoute } from '@routes/matching.route';
import { NotificationRoute } from '@routes/notification.route';
import { ProfileRoute } from '@routes/profile.route';
import ExtendedProfileRoute from '@routes/extendedProfile.route';
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
  new GroupChatRoute(),
  new MatchingRoute(),
  new ProfileRoute(),
  new ExtendedProfileRoute(),
  new TranslationRoute(),
  new NotificationRoute(),
  new ShowcaseRoute(),
]);

app.listen();
