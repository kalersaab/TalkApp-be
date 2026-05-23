export interface Message {
  message_id: string; // UUID
  sender_id: string;
  reciever_id:string;
  room_id: string;
  content: string;
  is_binary: boolean;
  created_at: Date;
}
