/**
 * Termo de privacidade do HeberHub. Texto-base: deve ser revisado pelo
 * jurídico da empresa antes do uso em produção.
 */
export function TextoTermo() {
  return (
    <div className="termo">
      <p>
        O HeberHub é usado para confirmar a sua presença diária na base e calcular as diárias do mês. Para isso, precisamos de alguns dados seus. Este termo
        explica quais são, por que são usados e por quanto tempo ficam guardados.
      </p>

      <h3>Quais dados coletamos</h3>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, telefone e, para prestadores, razão social, CNPJ e função.
        </li>
        <li>
          <strong>Localização:</strong> a posição do GPS do celular <strong>somente no momento em que você lê o QR Code</strong> do check-in. O app não acompanha
          sua localização em nenhum outro momento.
        </li>
        <li>
          <strong>Aparelho:</strong> um código que identifica o celular usado no check-in, para evitar check-in por outra pessoa.
        </li>
        <li>
          <strong>Presenças e diárias:</strong> as datas e horários dos check-ins e os valores calculados a partir deles.
        </li>
      </ul>

      <h3>Para que usamos</h3>
      <ul>
        <li>Confirmar que você estava na base no dia do check-in.</li>
        <li>Calcular as diárias e o fechamento mensal.</li>
        <li>Evitar fraudes e registrar quem fez cada alteração (auditoria).</li>
      </ul>

      <h3>Quem tem acesso</h3>
      <ul>
        <li>Você vê as suas próprias presenças.</li>
        <li>A equipe administrativa vê a lista de presenças do dia.</li>
        <li>Valores financeiros são vistos apenas pela coordenação e por quem ela autorizar.</li>
        <li>Os dados não são vendidos nem compartilhados com terceiros para outros fins.</li>
      </ul>

      <h3>Por quanto tempo guardamos</h3>
      <ul>
        <li>
          A localização exata de cada check-in é <strong>apagada automaticamente após 90 dias</strong>. Fica guardada apenas a distância até a base.
        </li>
        <li>Presenças, diárias e fechamentos ficam guardados pelo tempo necessário para cumprir obrigações legais e contratuais.</li>
      </ul>

      <h3>Seus direitos</h3>
      <p>
        Você pode pedir à coordenação, a qualquer momento, acesso aos seus dados, correção de dados errados ou informações sobre como eles são tratados, conforme
        a Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>
    </div>
  )
}
