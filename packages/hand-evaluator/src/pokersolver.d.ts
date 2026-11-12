// Tipos mínimos do `pokersolver`, usado só nos testes como referência.
// A biblioteca não publica tipos próprios.
declare module 'pokersolver' {
  interface MaoResolvida {
    /** 1 = carta alta ... 9 = straight flush. */
    rank: number;
    name: string;
    descr: string;
  }

  const pokersolver: {
    Hand: {
      solve(cartas: string[]): MaoResolvida;
      winners(maos: MaoResolvida[]): MaoResolvida[];
    };
  };

  export default pokersolver;
}
