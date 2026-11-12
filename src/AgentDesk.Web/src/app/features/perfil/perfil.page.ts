import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { mensagemDeErro } from '../../core/http/problema';
import { Avisos } from '../../core/ui/avisos.service';
import { Avatar } from '../../shared/ui/avatar.component';
import { PerfilApi } from './data-access/perfil.api';
import { CortadorFoto } from './ui/cortador-foto.component';

/** Quem está logado: foto (com ajuste do enquadramento), nome, e-mail e tipo de acesso. [[Módulo Contas]] */
@Component({
  selector: 'app-perfil',
  imports: [ReactiveFormsModule, Avatar, CortadorFoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="ui-pagina">
      <h1 class="ui-titulo-pagina">Meu perfil</h1>

      <section class="ui-cartao topo" aria-label="Quem está logado">
        <app-avatar class="grande" [nome]="auth.usuario()?.nome ?? ''" [src]="auth.fotoSrc()" />
        <div class="quem">
          <p class="nome">{{ auth.usuario()?.nome }}</p>
          <p class="ui-suave">{{ auth.usuario()?.email }}</p>
          <p class="selo">{{ auth.usuario()?.perfil === 'ADMIN' ? 'Administrador' : 'Usuário' }}</p>
        </div>
      </section>

      <section class="ui-cartao bloco" aria-labelledby="t-foto">
        <h2 id="t-foto">Foto</h2>
        @if (arquivo(); as a) {
          <app-cortador-foto [arquivo]="a" (confirmado)="enviar($event.blob, $event.nome)" (cancelado)="arquivo.set(null)" />
        } @else {
          <div class="acoes">
            <label class="ui-botao ui-botao--primario escolher" [class.desligado]="enviando()">
              {{ auth.fotoSrc() ? 'Trocar foto' : 'Escolher foto' }}
              <input class="ui-visualmente-oculto" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Escolher arquivo da foto"
                     [disabled]="enviando()" (change)="escolher($event)" />
            </label>
            @if (auth.fotoSrc()) {
              <button type="button" class="ui-botao" [disabled]="enviando()" (click)="remover()">Remover foto</button>
            }
          </div>
          <p class="ui-suave pequeno">Depois de escolher, você ajusta o enquadramento: arraste, aproxime e gire.</p>
        }
      </section>

      <form class="ui-cartao bloco" [formGroup]="form" (ngSubmit)="salvarNome()" novalidate>
        <h2>Nome</h2>
        <div class="ui-campo">
          <label for="nome">Como você quer ser chamado</label>
          <input id="nome" class="ui-entrada" maxlength="150" formControlName="nome" autocomplete="name" />
        </div>
        @if (erroNome()) {
          <p class="ui-erro" role="alert">{{ erroNome() }}</p>
        }
        <button type="submit" class="ui-botao ui-botao--primario" [disabled]="salvando()">Salvar nome</button>
      </form>
    </main>
  `,
  styles: `
    .topo { display: flex; gap: var(--ui-e4); align-items: center; margin-bottom: var(--ui-e4); }
    .grande { --avatar: 84px; }
    .quem { min-width: 0; display: grid; gap: var(--ui-e1); }
    .nome { font-size: var(--ui-t-lg); font-weight: 700; overflow-wrap: anywhere; }
    .selo {
      justify-self: start; margin-top: var(--ui-e1); padding: 2px var(--ui-e3); border-radius: 999px;
      background: color-mix(in srgb, var(--ui-marca-tinta) 18%, transparent); color: var(--ui-marca-tinta); font-size: var(--ui-t-xs); font-weight: 600;
    }
    .bloco { display: grid; gap: var(--ui-e3); margin-bottom: var(--ui-e4); }
    .bloco h2 { font-size: var(--ui-t-lg); }
    .pequeno { font-size: var(--ui-t-xs); }
    .acoes { display: flex; gap: var(--ui-e2); flex-wrap: wrap; }
    .escolher { position: relative; cursor: pointer; }
    .escolher.desligado { opacity: 0.5; pointer-events: none; }
  `,
})
export class PerfilPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(PerfilApi);
  private readonly avisos = inject(Avisos);

  protected readonly arquivo = signal<File | null>(null);
  protected readonly enviando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erroNome = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    nome: [this.auth.usuario()?.nome ?? '', [Validators.required, Validators.maxLength(150)]],
  });

  constructor() {
    // Traz do servidor o perfil completo (a foto pode ter mudado em outro aparelho).
    // Só preenche o campo se a pessoa ainda não começou a digitar (a resposta pode chegar depois).
    void this.auth.carregarPerfil().then(() => {
      if (this.form.controls.nome.pristine) this.form.controls.nome.setValue(this.auth.usuario()?.nome ?? '');
    });
  }

  protected escolher(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0] ?? null;
    entrada.value = ''; // permite escolher o mesmo arquivo de novo
    if (arquivo) this.arquivo.set(arquivo);
  }

  protected async enviar(blob: Blob, nome: string): Promise<void> {
    this.enviando.set(true);
    try {
      this.auth.atualizarUsuario(await this.api.enviarFoto(blob, nome));
      this.arquivo.set(null);
      this.avisos.mostrar('Foto atualizada.', 'sucesso');
    } catch (e) {
      this.avisos.mostrar(mensagemDeErro(e), 'erro');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async remover(): Promise<void> {
    this.enviando.set(true);
    try {
      this.auth.atualizarUsuario(await this.api.removerFoto());
      this.avisos.mostrar('Foto removida.', 'sucesso');
    } catch (e) {
      this.avisos.mostrar(mensagemDeErro(e), 'erro');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async salvarNome(): Promise<void> {
    const nome = this.form.controls.nome.value.trim();
    if (!nome) {
      this.erroNome.set('Informe o nome.');
      return;
    }
    this.salvando.set(true);
    this.erroNome.set(null);
    try {
      this.auth.atualizarUsuario(await this.api.atualizarNome(nome));
      this.avisos.mostrar('Nome atualizado.', 'sucesso');
    } catch (e) {
      this.erroNome.set(mensagemDeErro(e));
    } finally {
      this.salvando.set(false);
    }
  }
}
