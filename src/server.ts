import App from '@/app';
import AuthRoute from '@routes/auth.route';
import IndexRoute from '@routes/index.route';
import validateEnv from '@utils/validateEnv';
import { UserRoute } from './routes/users.route';

validateEnv();

const app = new App([new IndexRoute(), new UserRoute(), new AuthRoute()]);

app.listen();
