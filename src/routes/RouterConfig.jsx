import React from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Explorer from '../pages/Explorer'
import CreateInvoice from '../pages/CreateInvoice'
import PayInvoice from '../pages/PayInvoice'
import Dashboard from '../pages/Dashboard'
import TelegramApi from '../pages/TelegrsmApi'

const RouterConfig = () => {
  return (
    <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/explorer' element={<Explorer/>} />
        <Route path='/create' element={<CreateInvoice/>} />
        <Route path='/pay' element={<PayInvoice/>} />
        <Route path='/pay/:invoiceId' element={<PayInvoice/>} />
        <Route path='/dashboard' element={<Dashboard />} />
        <Route path='/integrations/telegram-api' element={<TelegramApi />} />
    </Routes>
  )
}

export default RouterConfig