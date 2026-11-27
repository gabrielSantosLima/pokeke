const powerCard = (icon, name, extra = '') => `
  <div class="tut-variant-card">
    <span class="tut-variant-icon">${icon}</span>
    <strong>${name}</strong>
    ${extra ? `<small>${extra}</small>` : ''}
  </div>
`;

export const VARIANT_TUTORIALS = {
  arcana: [
    {
      title: 'Escolha 2 cartas de poder',
      text:
        'Antes de cada mão, você recebe 4 opções secretas e escolhe 2. Os outros jogadores não veem suas escolhas. As cartas valem só para esta mão e não se repõem.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('👁️', 'Visão')}
            ${powerCard('🔄', 'Troca')}
            ${powerCard('🪞', 'Espelho')}
            ${powerCard('👻', 'Fantasma')}
          </div>
          <span class="tut-badge">Escolha 2 de 4</span>
        </div>
      `,
    },
    {
      title: 'Use no melhor momento',
      text:
        'Cada carta tem um momento certo. Algumas funcionam só antes do flop; outras podem ser usadas em qualquer rua. Você pode guardar uma carta até o showdown, mas ela expira no fim da mão.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('🃏', 'Mão Extra', 'pré-flop')}
            ${powerCard('👁️', 'Visão', 'qualquer rua')}
          </div>
          <span class="tut-caption">Passe o mouse ou toque para ver o efeito.</span>
        </div>
      `,
    },
    {
      title: 'Poderes de informação',
      text:
        'Visão mostra a próxima carta comunitária. Olho do Baralho mostra as 3 próximas cartas. Espelho revela a melhor mão atual de um oponente. Leitura revela as cartas fechadas dele.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('👁️', 'Visão')}
            ${powerCard('🔮', 'Olho do Baralho')}
            ${powerCard('🪞', 'Espelho')}
            ${powerCard('🧠', 'Leitura')}
          </div>
        </div>
      `,
    },
    {
      title: 'Poderes de mesa',
      text:
        'Troca substitui uma carta da sua mão. Mão Extra compra uma terceira carta. Fantasma recupera metade do que você investiu se desistir. Empate faz você vencer um showdown empatado.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('🔄', 'Troca')}
            ${powerCard('🃏', 'Mão Extra')}
            ${powerCard('👻', 'Fantasma')}
            ${powerCard('🤝', 'Empate')}
          </div>
        </div>
      `,
    },
    {
      title: 'O river distribui uma carta',
      text:
        'Quando a última carta comunitária é virada, todos os jogadores ainda na mão ganham mais uma carta de poder. É a única reposição da mão — use bem as três.',
      visual: `
        <div class="tut-col">
          <div class="tut-row">
            <div class="tut-card red">A<span class="suit">♥</span></div>
            <div class="tut-card">K<span class="suit">♠</span></div>
            <div class="tut-card red">Q<span class="suit">♦</span></div>
            <div class="tut-card">J<span class="suit">♣</span></div>
            <div class="tut-card red">10<span class="suit">♥</span></div>
            <span class="tut-plus">+</span>
            ${powerCard('🔮', 'Carta bônus')}
          </div>
          <span class="tut-badge">Todos ganham +1 no river</span>
        </div>
      `,
    },
  ],
  market: [
    {
      title: 'Ofertas pessoais e secretas',
      text:
        'No início de cada mão, você recebe 3 ofertas de mercado. Só você vê suas ofertas. Elas são aleatórias e mudam a cada mão.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('🃏', 'Carta Extra', '3 BB')}
            ${powerCard('👁️', 'Olhar', '1 BB')}
            ${powerCard('🪞', 'Espelho', '2 BB')}
          </div>
          <span class="tut-badge">3 ofertas por mão</span>
        </div>
      `,
    },
    {
      title: 'Compre na sua vez',
      text:
        'Quando for sua vez, abra o Mercado antes de agir. Você pode comprar uma oferta por mão. O custo sai do seu stack e entra no pote atual — o dinheiro não desaparece.',
      visual: `
        <div class="tut-col">
          <div class="tut-row">
            <span class="tut-btn ghost">Desistir</span>
            <span class="tut-btn check">Mesa</span>
            <span class="tut-btn call">Pagar</span>
            <span class="tut-badge">🛒 Mercado</span>
          </div>
          <span class="tut-caption">A compra não gasta sua ação de poker.</span>
        </div>
      `,
    },
    {
      title: 'Cartas e informações',
      text:
        'Carta Extra compra uma terceira carta. Troca substitui uma carta aleatória. Olhar mostra a próxima comunitária. Espelho revela uma carta de um oponente. Olho do Baralho mostra o topo do deck.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('🃏', 'Carta Extra')}
            ${powerCard('🔄', 'Troca')}
            ${powerCard('👁️', 'Olhar')}
            ${powerCard('🪞', 'Espelho')}
            ${powerCard('🔮', 'Olho do Baralho')}
          </div>
        </div>
      `,
    },
    {
      title: 'Uma compra por mão',
      text:
        'Você só pode comprar uma vez por mão, então escolha o momento. Se o preço for alto demais, guarde as fichas para apostar. Bots também compram e também têm ofertas secretas.',
      visual: `
        <div class="tut-col">
          <span class="tut-badge">1 compra por mão</span>
          <span class="tut-badge">Custo vai para o pote</span>
          <span class="tut-badge">Ofertas secretas</span>
        </div>
      `,
    },
  ],
  joker: [
    {
      title: 'Quatro curingas, um por naipe',
      text:
        'O baralho ganha um curinga de espadas, um de copas, um de ouros e um de paus. Eles entram no deck junto com as 52 cartas normais.',
      visual: `
        <div class="tut-col">
          <div class="tut-variant-row">
            ${powerCard('♠', 'Curinga', 'espadas')}
            ${powerCard('♥', 'Curinga', 'copas')}
            ${powerCard('♦', 'Curinga', 'ouros')}
            ${powerCard('♣', 'Curinga', 'paus')}
          </div>
          <span class="tut-badge">53 a 56 cartas na mesa</span>
        </div>
      `,
    },
    {
      title: 'O curinga vira qualquer carta do naipe',
      text:
        'O curinga de espadas pode ser qualquer espada, de 2 a Ás. O de copas pode ser qualquer copas, e assim por diante. Ele não muda de naipe.',
      visual: `
        <div class="tut-col">
          <div class="tut-row">
            <span class="tut-badge">♠ Curinga</span>
            <span class="tut-plus">=</span>
            <div class="tut-card">A<span class="suit">♠</span></div>
            <span class="tut-caption">ou qualquer outra espada</span>
          </div>
        </div>
      `,
    },
    {
      title: 'Ele completa a melhor mão',
      text:
        'O engine testa todas as substituições possíveis e escolhe a melhor mão. Curinga + A♠ K♠ Q♠ J♠ pode virar um Royal Flush. Curinga + 9♥ 8♥ 7♥ 6♥ pode virar uma sequência.',
      visual: `
        <div class="tut-col">
          <div class="tut-row">
            <span class="tut-badge">♠ Curinga</span>
            <span class="tut-plus">+</span>
            <div class="tut-card">A<span class="suit">♠</span></div>
            <div class="tut-card">K<span class="suit">♠</span></div>
            <div class="tut-card">Q<span class="suit">♠</span></div>
            <div class="tut-card">J<span class="suit">♠</span></div>
          </div>
          <span class="tut-badge">Royal Flush</span>
        </div>
      `,
    },
    {
      title: 'Curinga no board é de todos',
      text:
        'Se o curinga cair nas cartas comunitárias, qualquer jogador pode usá-lo, cada um escolhendo a substituição que fizer a sua melhor mão. Se cair na sua mão, só você usa.',
      visual: `
        <div class="tut-col">
          <div class="tut-row">
            <span class="tut-badge">Curinga na mesa</span>
            <span class="tut-plus">→</span>
            <span class="tut-badge">todos podem usar</span>
          </div>
          <div class="tut-row">
            <span class="tut-badge">Curinga na mão</span>
            <span class="tut-plus">→</span>
            <span class="tut-badge">só o dono usa</span>
          </div>
        </div>
      `,
    },
  ],
};
