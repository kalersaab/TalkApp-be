export interface User {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  name: string;
  avatar: string;
  isActive: boolean;
  provider: 'local' | 'google' | 'facebook' | 'phone';
  isVerified?: boolean;
  googleId?: string;
  role: 'user' | 'merchent' | 'admin';
}
export interface LoginUser {
  email: string;
  password: string;
}