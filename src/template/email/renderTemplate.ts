import fs from 'fs';
import handlebars from 'handlebars';
import path from 'path';

export const renderEmail = ({ templatePath, data }: any) => {
  // Use the provided templatePath as an absolute or relative path from project root
  const filePath = path.isAbsolute(templatePath) ? templatePath : path.join(process.cwd(), templatePath);
  const templateRaw = fs.readFileSync(filePath, 'utf-8');
  const template = handlebars.compile(templateRaw);
  return template(data);
};
