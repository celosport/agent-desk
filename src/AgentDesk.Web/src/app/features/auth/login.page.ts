import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { rotaInicial } from '../../core/auth/auth.guards';
import { AuthStore } from '../../core/auth/auth.store';
import { mensagemDeErro } from '../../core/http/problema';
import { AlternarTema } from '../../shared/ui/alternar-tema.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AlternarTema],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.page.scss',
  template: `
    <app-alternar-tema class="tema" />
    <main class="cartao ui-cartao">
      <header>
        <p class="marca">Agent Desk</p>
        <h1>Entrar</h1>
      </header>

      <form [formGroup]="form" (ngSubmit)="entrar()" novalidate>
        <div class="ui-campo">
          <label for="email">E-mail</label>
          <input id="email" class="ui-entrada" type="email" autocomplete="email" inputmode="email" formControlName="email"
                 [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched" />
        </div>
        <div class="ui-campo">
          <label for="senha">Senha</label>
          <input id="senha" class="ui-entrada" type="password" autocomplete="current-password" formControlName="senha" />
        </div>
        @if (erro()) {
          <p class="ui-erro" role="alert">{{ erro() }}</p>
        }
        <button type="submit" class="ui-botao ui-botao--primario ui-botao--bloco" [disabled]="enviando()">
          {{ enviando() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>

      <p class="rodape">Ainda não tem conta? <a routerLink="/cadastro">Criar conta</a></p>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', Validators.required],
  });
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected async entrar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.erro.set('Informe e-mail e senha.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const { email, senha } = this.form.getRawValue();
      await this.auth.entrar(email.trim(), senha);
      await this.router.navigateByUrl(rotaInicial(this.auth.usuario()?.perfil));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
