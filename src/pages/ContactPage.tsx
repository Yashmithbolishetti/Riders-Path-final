import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { EnrollmentNumberInput } from '../components/EnrollmentNumberInput';
import { validateIcfaiEnrollment } from '../utils/validation';
import {
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { studentUser, showToast } = useAuth();
  const [name, setName] = useState(studentUser?.fullName || '');
  const [enrollment, setEnrollment] = useState(studentUser?.icfaiEnrollmentNumber || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (studentUser) {
      if (!name) setName(studentUser.fullName || '');
      if (!enrollment) setEnrollment(studentUser.icfaiEnrollmentNumber || '');
    }
  }, [studentUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (enrollment.trim()) {
      const check = validateIcfaiEnrollment(enrollment);
      if (!check.valid) {
        setError(check.error || 'Please enter a valid ICFAI enrollment number.');
        return;
      }
    }
    if (!subject.trim() || !message.trim()) {
      setError('Please enter a subject and message.');
      return;
    }
    setError('');
    setSubmitted(true);
    showToast('Inquiry submitted to the Riders Path campus support desk.', 'success');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3 max-w-2xl">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#29483B]">
          <MessageSquare className="w-4 h-4" />
          <span>Campus Support</span>
        </div>
        <h1 className="rp-page-title">Contact Riders Path</h1>
        <p className="rp-text-secondary">
          Questions about a booking, document verification, or listing your vehicle? Reach our campus coordination team.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Contact Info */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 rp-card space-y-6">
            <h2 className="font-display font-semibold text-lg text-[#202522]">
              Campus Support Desk
            </h2>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#202522] block">
                    Campus Location
                  </span>
                  <p className="text-[#70756F] text-xs mt-0.5 leading-relaxed">
                    ICFAI University Hyderabad (IFHE), Donthanapally, Shankerpally Road, Hyderabad 501203
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#202522] block">
                    Phone &amp; WhatsApp Support
                  </span>
                  <p className="text-[#70756F] text-xs mt-0.5 font-mono tabular-nums">
                    +91 98490 21000
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#202522] block">Email</span>
                  <p className="text-[#70756F] text-xs mt-0.5 font-mono">
                    support@riderspath.icfai
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-[#29483B] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#202522] block">
                    Support Hours
                  </span>
                  <p className="text-[#70756F] text-xs mt-0.5">
                    7:00 AM – 10:30 PM (Daily)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#ECF4F0] border border-[#CBE2D6] text-xs text-[#24583C] flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 text-[#347653]" />
            <span>
              For active rental assistance or handover coordination, include your Booking Reference ID.
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 rp-card space-y-6">
          <h2 className="font-display font-semibold text-lg text-[#202522]">
            Send a Message
          </h2>

          {submitted ? (
            <div className="p-8 rounded-xl bg-[#ECF4F0] border border-[#CBE2D6] text-center space-y-3">
              <CheckCircle2 className="w-9 h-9 text-[#347653] mx-auto" />
              <h3 className="font-display font-semibold text-[#202522] text-base">
                Message Sent
              </h3>
              <p className="text-xs text-[#70756F] max-w-xs mx-auto">
                Thank you for reaching out. Our campus support team will reply via WhatsApp or email shortly.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setSubject('');
                  setMessage('');
                }}
                className="rp-btn rp-btn-secondary rp-btn-sm"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="p-3 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="rp-label">
                    Your Name <span className="text-[#B44242]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Arjun Varma"
                    className="rp-input"
                  />
                </div>

                <div>
                  <EnrollmentNumberInput
                    id="contact-enrollment-input"
                    value={enrollment}
                    onChange={(val) => {
                      setEnrollment(val);
                      if (error) setError('');
                    }}
                    label="ICFAI Enrollment Number"
                    required={false}
                    showHelpText={false}
                  />
                </div>
              </div>

              <div>
                <label className="rp-label">
                  Subject <span className="text-[#B44242]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="e.g. Booking verification, Listing question, Deposit refund"
                  className="rp-input"
                />
              </div>

              <div>
                <label className="rp-label">
                  Message <span className="text-[#B44242]">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="How can we help?"
                  className="rp-textarea"
                />
              </div>

              <button type="submit" className="rp-btn rp-btn-primary rp-btn-lg w-full">
                <Send className="w-4 h-4" />
                <span>Send Message</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
