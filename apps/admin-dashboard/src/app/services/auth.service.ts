import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { UserRole } from '@ticketshop-sy/shared-models';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CurrentUser {
  id: string;
  email: string;
  companyId: string;
  role: UserRole;
}

export interface AuthSession {
  accessToken: string;
  user: CurrentUser;
}

export interface InvitationSummary {
  email: string;
  companyName: string;
}

const TOKEN_KEY = 'tsy-dashboard-token';
const USER_KEY = 'tsy-dashboard-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly token = signal<string | null>(this.readToken());
  readonly user = signal<CurrentUser | null>(this.readUser());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  login(email: string, password: string): Observable<{ data: AuthSession }> {
    return this.http
      .post<{ data: AuthSession }>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((res) => this.persist(res.data)));
  }

  getInvitation(token: string): Observable<{ data: InvitationSummary }> {
    return this.http.get<{ data: InvitationSummary }>(
      `${environment.apiUrl}/auth/invitations/${token}`,
    );
  }

  acceptInvitation(token: string, password: string): Observable<{ data: AuthSession }> {
    return this.http
      .post<{ data: AuthSession }>(`${environment.apiUrl}/auth/invitations/${token}/accept`, {
        password,
      })
      .pipe(tap((res) => this.persist(res.data)));
  }

  fetchMe(): Observable<{ data: CurrentUser }> {
    return this.http
      .get<{ data: CurrentUser }>(`${environment.apiUrl}/auth/me`)
      .pipe(tap((res) => this.user.set(res.data)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  isAuthenticated(): boolean {
    return this.token() !== null;
  }

  private persist(session: AuthSession): void {
    localStorage.setItem(TOKEN_KEY, session.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    this.token.set(session.accessToken);
    this.user.set(session.user);
  }

  private readToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private readUser(): CurrentUser | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CurrentUser;
    } catch {
      return null;
    }
  }
}
