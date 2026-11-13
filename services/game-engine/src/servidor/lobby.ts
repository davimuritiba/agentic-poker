/**
 * Lobby provisório: um conjunto fixo de mesas criado ao subir o servidor. No documento,
 * Lobby/Matchmaking é um microsserviço próprio; ele será extraído daqui quando existir.
 */
import type { ResumoDaMesa } from '@poker/shared-types';
import { MesaAoVivo } from '../mesa/mesa-ao-vivo.js';

const MESAS_INICIAIS = [
  { id: 'iniciante', nome: 'Mesa Iniciante', smallBlind: 5, bigBlind: 10 },
  { id: 'intermediaria', nome: 'Mesa Intermediária', smallBlind: 25, bigBlind: 50 },
  { id: 'rapida', nome: 'Mesa Rápida', smallBlind: 10, bigBlind: 20, tempoDaVezMs: 15_000 },
];

export class Lobby {
  private readonly mesas = new Map<string, MesaAoVivo>();

  constructor(aoMudarMesa: (mesaId: string) => void) {
    for (const config of MESAS_INICIAIS) {
      this.mesas.set(
        config.id,
        new MesaAoVivo({ ...config, aoMudar: () => aoMudarMesa(config.id) }),
      );
    }
  }

  mesa(id: string): MesaAoVivo | undefined {
    return this.mesas.get(id);
  }

  resumos(): ResumoDaMesa[] {
    return [...this.mesas.values()].map((m) => m.resumo());
  }

  encerrar(): void {
    for (const m of this.mesas.values()) m.encerrar();
  }
}
