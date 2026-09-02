// 重定向到 /activate
import type { GetServerSideProps } from 'next';

export default function Index() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/activate',
      permanent: false,
    },
  };
};
