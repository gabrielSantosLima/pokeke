export const TUTORIAL_STEPS = [
  {
    title: 'O objetivo é montar a melhor mão',
    text:
      'Você recebe duas cartas fechadas e a mesa abre cinco cartas. Junte a melhor combinação de cinco e leve o pote. No Texas Hold\'em você pode usar zero, uma ou as duas cartas da sua mão.',
    visual: `
      <div class="tut-col">
        <div class="tut-cards">
          <div class="tut-card red">A<span class="suit">♥</span></div>
          <div class="tut-card red">K<span class="suit">♥</span></div>
          <span class="tut-plus">+</span>
          <div class="tut-card">Q<span class="suit">♣</span></div>
          <div class="tut-card red">J<span class="suit">♦</span></div>
          <div class="tut-card">10<span class="suit">♠</span></div>
          <div class="tut-card">7<span class="suit">♣</span></div>
          <div class="tut-card red">2<span class="suit">♦</span></div>
        </div>
        <span class="tut-badge">Sequência A-K-Q-J-10</span>
      </div>
    `,
  },
  {
    title: 'As ruas da mesa',
    text:
      'Pré-flop: só suas duas cartas. Depois vêm o flop (3 cartas), o turn (1) e o river (1). Há uma rodada de apostas em cada etapa.',
    visual: `
      <div class="tut-col">
        <div class="tut-row">
          <span class="tut-label">Suas cartas</span>
          <div class="tut-cards">
            <div class="tut-card">A<span class="suit">♠</span></div>
            <div class="tut-card red">K<span class="suit">♥</span></div>
          </div>
        </div>
        <div class="tut-street">
          <div class="tut-street-item">
            <div class="tut-card">Q<span class="suit">♣</span></div>
            <div class="tut-card red">7<span class="suit">♦</span></div>
            <div class="tut-card">2<span class="suit">♠</span></div>
            <span class="tut-label">Flop</span>
          </div>
          <div class="tut-street-item">
            <div class="tut-card red">J<span class="suit">♥</span></div>
            <span class="tut-label">Turn</span>
          </div>
          <div class="tut-street-item">
            <div class="tut-card">9<span class="suit">♣</span></div>
            <span class="tut-label">River</span>
          </div>
        </div>
      </div>
    `,
  },
  {
    title: 'O que fazer na sua vez',
    text:
      'Desistir abandona a mão. Mesa passa sem apostar. Pagar iguala a aposta. Subir aumenta. O slider e os atalhos de ½ pote, ¾ pote, pote e all-in ajudam no tamanho. Não é obrigatório jogar toda mão.',
    visual: `
      <div class="tut-col">
        <div class="tut-row">
          <span class="tut-btn ghost">Desistir</span>
          <span class="tut-btn check">Mesa</span>
          <span class="tut-btn call">Pagar 40</span>
          <span class="tut-btn raise">Subir</span>
        </div>
        <div class="tut-caption">F, M, C e R também funcionam no teclado.</div>
      </div>
    `,
  },
  {
    title: 'Blinds e posição',
    text:
      'O dealer (D) gira a cada mão. O small blind e o big blind são apostas obrigatórias feitas antes das cartas. Quem fala por último vê o que os outros fizeram — por isso a posição importa.',
    visual: `
      <div class="tut-col">
        <div class="tut-row">
          <span class="tut-dealer">D</span>
          <span class="tut-label">dealer</span>
          <span class="chip chip--red"></span>
          <span class="tut-label">small blind</span>
          <span class="chip chip--green"></span>
          <span class="tut-label">big blind</span>
        </div>
        <div class="tut-caption">Os blinds sobem? Aqui você escolhe 5/10, 10/20 ou 25/50.</div>
      </div>
    `,
  },
  {
    title: 'Fichas, all-in e side pots',
    text:
      'Suas fichas são seu stack. Apostou tudo? Você vai all-in e concorre até o valor que colocou. Se outro jogador também apostou mais, o excedente vai para um side pot. O app calcula e distribui tudo.',
    visual: `
      <div class="tut-col">
        <div class="tut-row">
          <div class="tut-chips">
            <span class="chip chip--black"></span>
            <span class="chip chip--purple"></span>
            <span class="chip chip--gold"></span>
            <span class="chip chip--red"></span>
          </div>
          <span class="tut-badge">Pote 1.240</span>
        </div>
        <div class="tut-row">
          <span class="tut-badge">All-in</span>
          <span class="tut-badge">Side pot</span>
          <span class="tut-badge">Showdown</span>
        </div>
      </div>
    `,
  },
  {
    title: 'Reaja e chame os amigos',
    text:
      'Use o botão 😀 na barra de ações para mandar uma reação — os bots também provocam. Para jogar em rede local, crie uma sala ou entre em uma existente; os bots completam os lugares vazios.',
    visual: `
      <div class="tut-col">
        <div class="tut-row tut-emojis">
          <span>😂</span><span>😎</span><span>🔥</span><span>😱</span><span>😤</span>
        </div>
        <div class="tut-row">
          <span class="tut-badge">Criar sala</span>
          <span class="tut-badge">Entrar em sala</span>
          <span class="tut-badge">🤖 bots completam</span>
        </div>
        <div class="tut-caption">Dica: comece no ritmo Calma se quiser acompanhar as jogadas.</div>
      </div>
    `,
  },
];
