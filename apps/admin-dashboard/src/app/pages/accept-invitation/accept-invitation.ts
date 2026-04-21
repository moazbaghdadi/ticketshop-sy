import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, InvitationSummary } from '../../services/auth.service';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './accept-invitation.html',
  styleUrl: './accept-invitation.css',
})
export class AcceptInvitationPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  invitation = signal<InvitationSummary | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);
  submitting = signal(false);
  submitError = signal<string | null>(null);

  form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)],
      }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: matchPasswords },
  );

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.loadError.set('رابط الدعوة غير صالح');
      this.loading.set(false);
      return;
    }

    this.auth.getInvitation(token).subscribe({
      next: (res) => {
        this.invitation.set(res.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404) {
          this.loadError.set('رابط الدعوة غير صالح أو غير موجود');
        } else if (err?.status === 410) {
          this.loadError.set('انتهت صلاحية هذه الدعوة أو تم قبولها مسبقًا');
        } else {
          this.loadError.set('تعذر تحميل بيانات الدعوة');
        }
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) return;

    const { password } = this.form.getRawValue();
    this.submitting.set(true);
    this.submitError.set(null);

    this.auth.acceptInvitation(token, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.message ?? 'تعذر قبول الدعوة');
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

function matchPasswords(group: import('@angular/forms').AbstractControl) {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { passwordsMismatch: true } : null;
}
