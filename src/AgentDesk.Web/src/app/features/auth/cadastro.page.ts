import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { rotaInicial } from '../../core/auth/auth.guards';
import { AuthStore } from '../../core/auth/auth.store';
import { mensagemDeErro } from '../../core/http/problema';
import { AlternarTema } from '../../shared/ui/alternar-tema.component';

/** Mesmas regras do CadastrarValidator da API (a API continua sendo quem decide). */
@Component({
  selector: 'app-cadastro',
  imports: [ReactiveFormsModule, RouterLink, AlternarTema],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.page.scss',
  template: `
    <app-alternar-tema class="tema" />
    <main class="cartao ui-cartao">
      <header>
        <p class="marca">Agent Desk</p>
        <h1>Criar conta</h1>
      </header>

      <form [formGroup]="form" (ngSubmit)="cadastrar()" novalidate>
        <div class="ui-campo">
          <label for="nome">Nome</label>
          <input id="nome" class="ui-entrada" autocomplete="name" formControlName="nome" />
        </div>
        <div class="ui-campo">
          <label for="email">E-mail</label>
          <input id="email" class="ui-entrada" type="email" autocomplete="email" inputmode="email" formControlName="email" />
        </div>
        <div class="ui-campo">
          <label for="senha">Senha (mínimo 8 caracteres)</label>
          <input id="senha" class="ui-entrada" type="password" autocomplete="new-password" formControlName="senha" />
        </div>
        @if (erro()) {
          <p class="ui-erro" role="alert">{{ erro() }}</p>
        }
        <button type="submit" class="ui-botao ui-botao--primario ui-botao--bloco" [disabled]="enviando()">
          {{ enviando() ? 'Criando…' : 'Criar conta' }}
        </button>
      </form>

      <p class="rodape">Já tem conta? <a routerLink="/entrar">Entrar</a></p>
    </main>
  `,
})
export class CadastroPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(8)]],
  });
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected async cadastrar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.erro.set(this.form.controls.senha.hasError('minlength') ? 'A senha tem no mínimo 8 caracteres.' : 'Preencha nome, e-mail e senha.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const { nome, email, senha } = this.form.getRawValue();
      await this.auth.cadastrar(nome.trim(), email.trim(), senha);
      await this.router.navigateByUrl(rotaInicial(this.auth.usuario()?.perfil));
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
