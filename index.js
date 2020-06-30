require( 'dotenv' ).config();

const app = require( './app' );
const axios = require( 'axios' );
const moment = require( 'moment' );
const Telegraf = require( 'telegraf' );
const Markup = require( 'telegraf/markup' );
const Stage = require( 'telegraf/stage' );
const WizardScene = require( 'telegraf/scenes/wizard' );
const Composer = require( 'telegraf/composer' );
const session = require( 'telegraf/session' );

const port = process.env.PORT || 3000;

const stepHandler = new Composer();

state = {
  data: {
    phone: '',
    fullname: '',
    email: 'bot@gmail.com',
    appointments: []
  },
  additional: {
    staff_id: '',
    service_id: '',
    company_id: '350484',
    date: ''
  }
};

stepHandler.action( 'next', ( ctx ) => {

  onGet( `book_staff/${state.additional.company_id}` ).then( res => {

    const formatData = res.map( item => {
      return [ Markup.callbackButton( item.name, item.id ) ];
    } );

    ctx.reply( 'Пожалуйста выберите мастера из списка доступных.',
      Markup.inlineKeyboard( formatData ).extra() );

    return ctx.wizard.next();
  } );

} );

const superWizard = new WizardScene( 'super-wizard',
  ( ctx ) => {

    state.data.fullname = `${ctx.from.first_name}`;

    ctx.reply( `Привет ${ctx.from.first_name}. С Вами CentralYard. Нажмите пожалуйста Next для записи на сеанс.`,
      Markup.inlineKeyboard( [
        Markup.callbackButton( '➡️ Next', 'next' )
      ] ).extra() );

    return ctx.wizard.next();
  },
  stepHandler,
  ( ctx ) => {

    state.additional.staff_id = ctx.update.callback_query.data;

    state.data.appointments.push( {
      id: Math.floor( Math.random() * 100 ),
      staff_id: state.additional.staff_id,
      services: [],
      datetime: '',
    } );

    onGet( `book_services/${state.additional.company_id}?staff_id=${state.additional.staff_id}` )
      .then( res => {

        const formatData = res.services.map( item => {
          return [ Markup.callbackButton( `${item.title}-${item.price_max}`, item.id ) ]
        } );

        ctx.reply( 'Пожалуйста выберите услугу.', Markup.inlineKeyboard( formatData ).extra() );

      } );
    return ctx.wizard.next();
  },
  ( ctx ) => {

    state.additional.service_id = ctx.update.callback_query.data;

    state.data.appointments[ 0 ].services.push( state.additional.service_id );

    onGet( `book_dates/${state.additional.company_id}?service_ids=${state.additional.service_id}` )
      .then( res => {
        ctx.reply( 'Пожалуйста выберите удобную для вас дату визита.',
          Markup.keyboard( res.booking_dates )
            .oneTime()
            .resize()
            .extra() );
      } );
    return ctx.wizard.next();
  },
  ( ctx ) => {

    state.additional.date = ctx.update.message.text;

    onGet( `book_times/${state.additional.company_id}/${state.additional.staff_id}/${state.additional.date}?service_ids=${state.additional.service_id}` )
      .then( res => {

        const formatData = res.map( item => {
          return item.time;
        } );

        ctx.reply( 'Пожалйуста выберите удобное для вас время визита.',
          Markup.keyboard( formatData )
            .oneTime()
            .resize()
            .extra() );
      } );
    return ctx.wizard.next();
  },
  ( ctx ) => {

    let initialDate = state.additional.date;
    let time = ctx.update.message.text;

    state.data.appointments[ 0 ].datetime = moment( initialDate + " " + time ).format();

    ctx.reply( 'Пожалуйста введите ваш номер телефона в формате +380634109384.' );
    return ctx.wizard.next();
  },
  ( ctx ) => {
    state.data.phone = ctx.update.message.text;

    onPost( state.data )
      .then( res => {
        console.log( res );
        state.data = {};
      } )
      .catch( e => {
        state.data = {};
        console.error( e.response.errors )
      } );

    ctx.reply( 'На этом все. Спасибо за запись. Сообщение о записи будет доставлено на ваш телефон за час до визита.' );
    return ctx.scene.leave();
  }
);

const bot = new Telegraf( process.env.BOT_TOKEN );
const stage = new Stage( [ superWizard ], { default: 'super-wizard' } );

bot.use( session() );
bot.use( stage.middleware() );

bot.launch();

const instance = axios.create( {
  baseURL: 'https://api.yclients.com/api/v1/',
  timeout: 1000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `${process.env.API_TOKEN}`,
  }
} );

async function onGet ( url ) {
  try {
    const { data } = await instance.get( url );
    return data
  } catch ( e ) {
    console.error( e );
  }
}

async function onPost ( data ) {
  await instance( {
    method: 'post',
    url: `book_record/${state.additional.company_id}`,
    data
  } );
}

app.listen( port, () => console.log( `Server on port ${port}` ) );