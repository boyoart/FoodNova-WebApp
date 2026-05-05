import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { profileAPI } from '../services/api'
import './ProfilePage.css'

const emptyAddress = { label:'', recipient_name:'', phone:'', country:'Nigeria', state:'', city:'', lga:'', street:'', address_line:'', landmark:'', postal_code:'', is_default:false }

export default function ProfilePage(){
  const [profile,setProfile]=useState({full_name:'',email:'',phone:'',avatar_url:''})
  const [addresses,setAddresses]=useState([])
  const [form,setForm]=useState(emptyAddress)
  const [editingId,setEditingId]=useState(null)
  const hasGoogleKey=Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  useEffect(()=>{(async()=>{const res=await profileAPI.getProfile();const p=res.data?.profile||res.profile||{};setProfile(p);setAddresses(res.data?.addresses||res.addresses||[])})().catch(()=>toast.error('Failed to load profile'))},[])
  const saveProfile=async()=>{await profileAPI.updateProfile(profile);toast.success('Profile saved')}
  const saveAddress=async()=>{ if(editingId){await profileAPI.updateAddress(editingId,form)} else {await profileAPI.createAddress(form)}; const r=await profileAPI.getAddresses(); setAddresses(r.data?.addresses||r.addresses||[]); setForm(emptyAddress); setEditingId(null)}
  return <div className='profile-page'><h1>My Profile</h1><div className='profile-card'><div className='avatar'>{profile.avatar_url?<img src={profile.avatar_url} alt='avatar'/>:<span>{(profile.full_name||'U').split(' ').map(v=>v[0]).join('').slice(0,2)}</span>}</div><div><h3>{profile.full_name}</h3><p>{profile.email}</p><p>{profile.phone}</p></div></div>
  <div className='profile-form'><input value={profile.full_name||''} onChange={e=>setProfile({...profile,full_name:e.target.value})} placeholder='Full Name'/><input value={profile.phone||''} onChange={e=>setProfile({...profile,phone:e.target.value})} placeholder='Phone'/><input value={profile.avatar_url||''} onChange={e=>setProfile({...profile,avatar_url:e.target.value})} placeholder='Avatar URL'/><button onClick={saveProfile}>Save Profile</button></div>
  <h2>Saved Addresses</h2>{addresses.map(a=><div className='address-card' key={a.id}><strong>{a.label||'Address'} {a.is_default&&'• Default'}</strong><p>{a.recipient_name} ({a.phone})</p><p>{a.address_line||a.street}, {a.city}, {a.lga}, {a.state}, {a.country}</p><p>{a.landmark}</p><button onClick={()=>{setForm(a);setEditingId(a.id)}}>Edit</button><button onClick={async()=>{await profileAPI.deleteAddress(a.id);setAddresses(addresses.filter(x=>x.id!==a.id))}}>Delete</button><button onClick={async()=>{await profileAPI.setDefaultAddress(a.id);const r=await profileAPI.getAddresses();setAddresses(r.data?.addresses||r.addresses||[])}}>Set Default</button></div>)}
  <h3>{editingId?'Edit Address':'Add Address'}</h3>{hasGoogleKey?<p>Google autocomplete enabled with your configured API key.</p>:<p>Manual address entry</p>}
  <div className='address-form'>{['label','recipient_name','phone','country','state','city','lga','street','address_line','landmark','postal_code'].map(f=><input key={f} value={form[f]||''} onChange={e=>setForm({...form,[f]:e.target.value})} placeholder={f}/>) }<label><input type='checkbox' checked={form.is_default||false} onChange={e=>setForm({...form,is_default:e.target.checked})}/>Make default</label><button onClick={saveAddress}>{editingId?'Update':'Add'} Address</button></div></div>
}
