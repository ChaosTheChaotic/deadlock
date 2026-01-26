export interface User {
  uid: string;
  email: string;
}

export class AuthService {
  private static user: User | null = null;

  static setUser(user: User) {
    this.user = user;
  }

  static getUser(): User | null {
    return this.user;
  }

  static clearUser() {
    this.user = null;
  }
}
