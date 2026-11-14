/**
 * Tipo (perfil) do Coach IA escolhido no menu inicial. Fica guardado no navegador e é lido
 * pelo painel do coach quando o jogador senta na mesa.
 */
import { PERFIL_RECOMENDADO, ehPerfilDoCoach, type PerfilDoCoach } from '@poker/shared-types';

const CHAVE_PERFIL = 'poker:coachPerfil';

export function lerPerfil(): PerfilDoCoach {
  try {
    const salvo = localStorage.getItem(CHAVE_PERFIL);
    return ehPerfilDoCoach(salvo) ? salvo : PERFIL_RECOMENDADO;
  } catch {
    return PERFIL_RECOMENDADO;
  }
}

export function salvarPerfil(perfil: PerfilDoCoach): void {
  try {
    localStorage.setItem(CHAVE_PERFIL, perfil);
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}
