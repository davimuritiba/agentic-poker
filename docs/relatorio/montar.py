"""Monta docs/relatorio/relatorio.html a partir do template, colando trechos reais do código."""
import html, re, sys, pathlib
raiz = pathlib.Path(sys.argv[1])
tpl = (raiz / 'docs/relatorio/relatorio.template.html').read_text(encoding='utf8')

def destacar(linha):
    e = html.escape(linha)
    s = linha.lstrip()
    if s.startswith(('//', '/*', '*', '*/')):
        return f'<span class="com">{e}</span>'
    m = re.search(r'(?<![:"\'/])//\s', linha)
    if m and linha.count("'") % 2 == 0 and linha[:m.start()].count('`') % 2 == 0:
        return html.escape(linha[:m.start()]) + f'<span class="com">{html.escape(linha[m.start():])}</span>'
    return e

def trecho(m):
    caminho, a, b = m.group(1), int(m.group(2)), int(m.group(3))
    linhas = (raiz / caminho).read_text(encoding='utf8').split('\n')[a - 1:b]
    print(f'{caminho}:{a}-{b}\n   ^ {linhas[0][:90]}\n   $ {linhas[-1][:90]}', file=sys.stderr)
    while linhas and not linhas[-1].strip():
        linhas.pop()
    corpo = '\n'.join(destacar(l) for l in linhas)
    ultima = linhas[-1].rstrip()
    completo = ultima in ('}', '};', '];', '});', ' */', '*/') or ultima.startswith(('export const', ' */'))
    if not completo:
        corpo += '\n<span class="com">  …</span>'
    return '<pre>' + corpo + '</pre>'

saida = re.sub(r'\{\{codigo (\S+) (\d+) (\d+)\}\}', trecho, tpl)
saida = re.sub(r'(<table[^>]*>\s*)(<tr><th.*?</tr>)', r'\1<thead>\2</thead>', saida, flags=re.S)
(raiz / 'docs/relatorio/relatorio.html').write_text(saida, encoding='utf8')
